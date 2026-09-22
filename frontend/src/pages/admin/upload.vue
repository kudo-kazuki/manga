<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useAdminAuthStore } from '@/stores/adminAuth'
import {
    collectDroppedFiles,
    collectSelectedFiles,
    parseWorkFiles,
} from '@/upload/folderParser'
import type { ParsedWork, RelativeImageFile } from '@/upload/types'
import { convertImageToWebp } from '@/upload/webp'
import {
    AdminAuthenticationError,
    completeUploadedWork,
    putPresignedObject,
    requestPresignedFiles,
    UploadCompletionError,
} from '@/upload/uploadApi'
import {
    UploadManager,
    type UploadFailure,
    type UploadSnapshot,
} from '@/upload/uploadManager'
import {
    createCompletionFailurePresentation,
    createItemFailurePresentation,
    createUnexpectedFailurePresentation,
    formatFailureKind,
    type FailurePresentation,
} from '@/upload/failurePresentation'

const router = useRouter()
const adminAuth = useAdminAuthStore()
const work = ref<ParsedWork | null>(null)
const errorMessage = ref('')
const isParsing = ref(false)
// 漫画の線画・トーンを保ちつつ容量を抑える初期値。管理者は画面上で変更できる。
const quality = ref(0.7)
const isAuthorizing = ref(true)
const uploadManager = shallowRef<UploadManager | null>(null)
const uploadSnapshot = ref<UploadSnapshot | null>(null)
const isUploadRunning = ref(false)
const isPaused = ref(false)
const isPublished = ref(false)
const isSuccessDialogVisible = ref(false)
// 成功・失敗とも、処理結果が確定した時だけ表示する。
const isFailureDialogVisible = ref(false)
const completionFailure = ref<FailurePresentation | null>(null)

const displayedFailures = computed<readonly UploadFailure[]>(() => {
    if (completionFailure.value) return []
    return uploadSnapshot.value?.failures ?? []
})

const failurePresentation = computed<FailurePresentation>(
    () =>
        completionFailure.value ??
        createItemFailurePresentation(displayedFailures.value),
)

const failureTotal = computed(() => uploadSnapshot.value?.total ?? 0)

const progressPercent = computed(() => {
    const snapshot = uploadSnapshot.value
    if (!snapshot || snapshot.total === 0) return 0
    return Math.round(
        ((snapshot.uploaded + snapshot.failed) / snapshot.total) * 100,
    )
})

const compressionPercent = computed(() => {
    const snapshot = uploadSnapshot.value
    if (!snapshot || snapshot.convertedOriginalBytes === 0) return 0
    return Math.max(
        0,
        Math.round(
            (1 - snapshot.convertedBytes / snapshot.convertedOriginalBytes) *
                1000,
        ) / 10,
    )
})

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let value = bytes / 1024
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex += 1
    }
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

onMounted(async () => {
    // Cookie本体はHttpOnlyのまま、署名済みsessionが有効かだけをBackendへ確認する。
    if (!(await adminAuth.checkSession())) {
        await router.replace('/admin/login')
        return
    }
    isAuthorizing.value = false
})

const formattedSize = computed(() => {
    if (!work.value) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    let size = work.value.totalBytes
    let unit = 0
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024
        unit += 1
    }
    return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
})

const parseFiles = async (
    files: Promise<RelativeImageFile[]> | RelativeImageFile[],
) => {
    if (isParsing.value) return
    isParsing.value = true
    errorMessage.value = ''
    work.value = null
    uploadManager.value = null
    uploadSnapshot.value = null
    isPublished.value = false
    isSuccessDialogVisible.value = false
    isFailureDialogVisible.value = false
    completionFailure.value = null
    try {
        // この段階ではFile参照とpathだけを整理し、画像decodeは開始しない。
        work.value = parseWorkFiles(await files)
    } catch (error) {
        errorMessage.value =
            error instanceof Error
                ? error.message
                : 'フォルダ解析に失敗しました。'
    } finally {
        isParsing.value = false
    }
}

const onDrop = async (event: DragEvent) => {
    if (!event.dataTransfer) return
    await parseFiles(collectDroppedFiles(event.dataTransfer))
}

const onFolderSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement
    if (input.files) await parseFiles(collectSelectedFiles(input.files))
    input.value = ''
}

const logout = async () => {
    await adminAuth.logout()
    await router.replace('/admin/login')
}

const handleUploadError = async (error: unknown) => {
    if (error instanceof AdminAuthenticationError) {
        await router.replace('/admin/login')
        return
    }
    if (error instanceof UploadCompletionError) {
        completionFailure.value = createCompletionFailurePresentation(
            error.reason === 'objects-not-ready',
        )
        isFailureDialogVisible.value = true
    } else {
        completionFailure.value = createUnexpectedFailurePresentation()
        isFailureDialogVisible.value = true
    }
    errorMessage.value =
        error instanceof Error ? error.message : 'Uploadに失敗しました。'
}

const finalizeUpload = async () => {
    if (!work.value) return
    // Clientの成功数だけで公開せず、BackendにS3 objectを再確認させてからmetadataを確定する。
    await completeUploadedWork(work.value)
    isPublished.value = true
    isSuccessDialogVisible.value = true
}

const startUpload = async () => {
    if (!work.value || isUploadRunning.value) return
    errorMessage.value = ''
    completionFailure.value = null
    isFailureDialogVisible.value = false
    isUploadRunning.value = true
    isPaused.value = false
    const manager = new UploadManager(work.value, {
        concurrency: 5,
        quality: quality.value,
        requestPresign: requestPresignedFiles,
        convert: convertImageToWebp,
        upload: putPresignedObject,
        onChange(snapshot) {
            // class内部のmutable stateを直接templateへ渡さず、小さな集計値だけをreactiveにする。
            uploadSnapshot.value = snapshot
        },
    })
    uploadManager.value = manager
    try {
        await manager.run()
        const snapshot = manager.snapshot()
        if (snapshot.uploaded === snapshot.total && snapshot.failed === 0) {
            await finalizeUpload()
        } else if (snapshot.failed > 0) {
            isFailureDialogVisible.value = true
        }
    } catch (error) {
        await handleUploadError(error)
    } finally {
        isUploadRunning.value = false
    }
}

const pauseUpload = () => {
    uploadManager.value?.pause()
    isPaused.value = true
}

const resumeUpload = () => {
    uploadManager.value?.resume()
    isPaused.value = false
}

const retryFailed = async () => {
    if (!uploadManager.value || isUploadRunning.value) return
    isUploadRunning.value = true
    completionFailure.value = null
    isFailureDialogVisible.value = false
    try {
        await uploadManager.value.retryFailed()
        const snapshot = uploadManager.value.snapshot()
        if (snapshot.uploaded === snapshot.total && snapshot.failed === 0) {
            await finalizeUpload()
        } else if (snapshot.failed > 0) {
            isFailureDialogVisible.value = true
        }
    } catch (error) {
        await handleUploadError(error)
    } finally {
        isUploadRunning.value = false
    }
}

const retryFinalize = async () => {
    if (isUploadRunning.value || isPublished.value) return
    errorMessage.value = ''
    isUploadRunning.value = true
    completionFailure.value = null
    isFailureDialogVisible.value = false
    try {
        // complete APIは同じrequestを安全に再送でき、画像の再Uploadは不要。
        await finalizeUpload()
    } catch (error) {
        await handleUploadError(error)
    } finally {
        isUploadRunning.value = false
    }
}
</script>

<template>
    <main v-if="isAuthorizing" class="AdminPage AdminPage--loading">
        管理セッションを確認中…
    </main>
    <main v-else class="AdminPage">
        <header class="AdminPage__header">
            <div>
                <p>ADMIN</p>
                <h1>漫画アップロード</h1>
            </div>
            <div class="AdminPage__headerActions">
                <router-link to="/admin">管理メニュー</router-link>
                <router-link to="/admin/delete">作品削除</router-link>
                <button type="button" @click="logout">管理ログアウト</button>
            </div>
        </header>

        <section
            class="AdminPage__drop"
            @dragover.prevent
            @drop.prevent="onDrop"
        >
            <strong>作品フォルダをここへ1回だけドロップ</strong>
            <span>作品 / chapter / JPEG・PNG の階層を解析します</span>
            <label>
                フォルダを選択
                <input
                    type="file"
                    webkitdirectory
                    directory
                    multiple
                    @change="onFolderSelected"
                />
            </label>
        </section>

        <p v-if="isParsing">フォルダを解析中…</p>
        <p v-if="errorMessage" class="AdminPage__error" role="alert">
            {{ errorMessage }}
        </p>

        <section v-if="work" class="AdminPage__preview">
            <h2>{{ work.title }}</h2>
            <dl>
                <div>
                    <dt>作品ID</dt>
                    <dd>{{ work.id }}</dd>
                </div>
                <div>
                    <dt>chapters</dt>
                    <dd>{{ work.chapters.length }}</dd>
                </div>
                <div>
                    <dt>images</dt>
                    <dd>{{ work.totalImages }}</dd>
                </div>
                <div>
                    <dt>original</dt>
                    <dd>{{ formattedSize }}</dd>
                </div>
            </dl>

            <label class="AdminPage__quality">
                <span>WebP quality: {{ quality.toFixed(2) }}</span>
                <input
                    v-model.number="quality"
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.05"
                    :disabled="isUploadRunning || !!uploadSnapshot"
                />
            </label>

            <section v-if="uploadSnapshot" class="AdminPage__progress">
                <div class="AdminPage__progressBar">
                    <span :style="{ width: `${progressPercent}%` }"></span>
                </div>
                <strong>{{ progressPercent }}%</strong>
                <p>
                    Upload済み: {{ uploadSnapshot.uploaded }} /
                    {{ uploadSnapshot.total }}　変換済み:
                    {{ uploadSnapshot.converted }}　失敗:
                    {{ uploadSnapshot.failed }}
                </p>
                <p>
                    元容量: {{ formatBytes(work.totalBytes) }}　変換後:
                    {{ formatBytes(uploadSnapshot.convertedBytes) }}　圧縮率:
                    {{ compressionPercent }}%
                </p>
                <p v-if="uploadSnapshot.currentFiles.length">
                    現在:
                    {{ uploadSnapshot.currentFiles.slice(0, 3).join(', ') }}
                </p>
                <div class="AdminPage__controls">
                    <button
                        v-if="isUploadRunning && !isPaused"
                        type="button"
                        @click="pauseUpload"
                    >
                        Pause
                    </button>
                    <button
                        v-if="isUploadRunning && isPaused"
                        type="button"
                        @click="resumeUpload"
                    >
                        Resume
                    </button>
                    <button
                        v-if="!isUploadRunning && uploadSnapshot.failed > 0"
                        type="button"
                        @click="retryFailed"
                    >
                        Retry failed files
                    </button>
                </div>
            </section>

            <ul v-if="work.warnings.length" class="AdminPage__warnings">
                <li
                    v-for="warning in work.warnings.slice(0, 20)"
                    :key="warning"
                >
                    {{ warning }}
                </li>
            </ul>

            <!-- 1万件をDOMへ並べず、chapter単位の集計だけを表示する。 -->
            <div class="AdminPage__chapters">
                <div v-for="chapter in work.chapters" :key="chapter.id">
                    <span>{{ chapter.title }}</span>
                    <span>{{ chapter.pages.length }} pages</span>
                </div>
            </div>

            <button
                v-if="!uploadSnapshot"
                class="AdminPage__start"
                type="button"
                @click="startUpload"
            >
                WebP変換・Upload開始
            </button>
            <button
                v-if="
                    uploadSnapshot?.uploaded === uploadSnapshot?.total &&
                    !isPublished &&
                    !isUploadRunning
                "
                class="AdminPage__start"
                type="button"
                @click="retryFinalize"
            >
                metadata確定を再試行
            </button>
            <p v-if="isPublished" class="AdminPage__notice">
                全画像のUploadとmetadataの公開が完了しました。
                <router-link :to="`/works/${encodeURIComponent(work.id)}`">
                    作品ページを開く
                </router-link>
            </p>
        </section>

        <Modal
            title="アップロード完了"
            size="m"
            :is-show="isSuccessDialogVisible"
            :is-text-center="true"
            @close="isSuccessDialogVisible = false"
        >
            <template #body>
                <section class="UploadSuccessDialog">
                    <span class="UploadSuccessDialog__check" aria-hidden="true">
                        ✓
                    </span>
                    <p class="UploadSuccessDialog__eyebrow">UPLOAD COMPLETE</p>
                    <h2>アップロードが完了しました</h2>
                    <p>
                        すべての画像をWebPへ変換し、作品情報と公開一覧を更新しました。
                    </p>
                </section>
            </template>
        </Modal>

        <Modal
            title="アップロード失敗"
            size="m"
            :is-show="isFailureDialogVisible"
            :is-text-center="true"
            @close="isFailureDialogVisible = false"
        >
            <template #body>
                <section class="UploadFailureDialog">
                    <span class="UploadFailureDialog__mark" aria-hidden="true">
                        !
                    </span>
                    <p class="UploadFailureDialog__eyebrow">UPLOAD FAILED</p>
                    <h2>{{ failurePresentation.title }}</h2>
                    <p>{{ failurePresentation.description }}</p>

                    <p
                        v-if="displayedFailures.length"
                        class="UploadFailureDialog__count"
                    >
                        失敗: {{ displayedFailures.length }} /
                        {{ failureTotal }}
                        images
                    </p>
                    <ul
                        v-if="failurePresentation.kinds.length"
                        class="UploadFailureDialog__kinds"
                        aria-label="失敗した処理"
                    >
                        <li
                            v-for="kind in failurePresentation.kinds"
                            :key="kind"
                        >
                            {{ formatFailureKind(kind) }}
                        </li>
                    </ul>

                    <section class="UploadFailureDialog__recommendation">
                        <h3>次に行うこと</h3>
                        <p>{{ failurePresentation.recommendation }}</p>
                    </section>

                    <details
                        v-if="displayedFailures.length"
                        class="UploadFailureDialog__details"
                    >
                        <summary>失敗した画像を確認する</summary>
                        <ul>
                            <li
                                v-for="failure in displayedFailures.slice(0, 5)"
                                :key="failure.relativePath"
                            >
                                <code>{{ failure.relativePath }}</code>
                                <div>
                                    <span>{{
                                        formatFailureKind(failure.kind)
                                    }}</span>
                                    <small>{{ failure.message }}</small>
                                </div>
                            </li>
                        </ul>
                        <p v-if="displayedFailures.length > 5">
                            ほか {{ displayedFailures.length - 5 }} 件
                        </p>
                    </details>
                </section>
            </template>
        </Modal>
    </main>
</template>

<style scoped lang="scss">
.AdminPage {
    width: min(100%, 980px);
    min-height: 100%;
    padding: 24px;
    margin: 0 auto;

    &--loading {
        display: grid;
        place-items: center;
    }

    &__header,
    &__preview,
    &__quality {
        display: grid;
        gap: 8px;
    }

    &__header {
        grid-template-columns: 1fr auto;
        align-items: center;
    }

    &__header p {
        color: #85734c;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
    }

    &__headerActions {
        display: flex;
        align-items: center;
        gap: 10px;

        a {
            color: #314a78;
            font-size: 13px;
        }
    }

    &__header button,
    &__drop label,
    &__controls button,
    &__start {
        padding: 8px 12px;
        border: 1px solid #d8d4cc;
        border-radius: 8px;
        background: #fff;
        cursor: pointer;
    }

    &__drop {
        display: grid;
        gap: 10px;
        padding: 48px 24px;
        margin-top: 24px;
        border: 2px dashed #b9ae94;
        border-radius: 14px;
        background: #faf8f3;
        text-align: center;
        place-items: center;
    }

    &__drop input {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
    }

    &__preview {
        margin-top: 28px;
    }

    dl {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
    }

    dl div,
    &__chapters div {
        padding: 12px;
        border: 1px solid #e4e1da;
        border-radius: 8px;
        background: #fff;
    }

    dt {
        color: #716d65;
        font-size: 12px;
    }

    dd {
        margin-top: 4px;
        font-weight: 700;
        overflow-wrap: anywhere;
    }

    &__chapters {
        display: grid;
        gap: 8px;
        max-height: 360px;
        overflow: auto;
    }

    &__chapters div {
        display: flex;
        justify-content: space-between;
    }

    &__error,
    &__warnings {
        color: #b52222;
    }

    &__notice {
        color: #716d65;
        font-size: 13px;
    }

    &__progress {
        display: grid;
        gap: 8px;
        padding: 16px;
        border-radius: 10px;
        background: #f5f3ee;
    }

    &__progressBar {
        height: 12px;
        overflow: hidden;
        border-radius: 999px;
        background: #ddd8cd;
    }

    &__progressBar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: #85734c;
        transition: width 0.2s ease;
    }

    &__controls {
        display: flex;
        gap: 8px;
    }

    &__start {
        justify-self: start;
        background: #302e2a;
        color: #fff;
    }

    @media (max-width: 700px) {
        dl {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
}
</style>

<style scoped lang="scss">
.UploadSuccessDialog {
    display: grid;
    justify-items: center;
    padding: 10px 0 4px;
    text-align: center;

    &__check {
        display: grid;
        width: 72px;
        height: 72px;
        place-items: center;
        border-radius: 50%;
        background: #e9f8ef;
        box-shadow: inset 0 0 0 2px #5bbf7c;
        color: #167a3b;
        font-size: 44px;
        font-weight: 700;
        line-height: 1;
    }

    &__eyebrow {
        margin-top: 20px;
        color: #168043;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.16em;
    }

    h2 {
        margin-top: 8px;
        color: #27352b;
        font-size: 23px;
    }

    p:last-child {
        margin-top: 12px;
        color: #5f6b62;
        font-size: 14px;
        line-height: 1.7;
    }
}

.UploadFailureDialog {
    display: grid;
    justify-items: center;
    padding: 10px 0 4px;
    text-align: center;

    &__mark {
        display: grid;
        width: 72px;
        height: 72px;
        place-items: center;
        border-radius: 50%;
        background: #fff2e8;
        box-shadow: inset 0 0 0 2px #df7a35;
        color: #b74b17;
        font-size: 46px;
        font-weight: 700;
        line-height: 1;
    }

    &__eyebrow {
        margin-top: 20px;
        color: #b74b17;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.16em;
    }

    h2 {
        margin-top: 8px;
        color: #482d1c;
        font-size: 23px;
    }

    > p:not(.UploadFailureDialog__count) {
        margin-top: 12px;
        color: #685b53;
        font-size: 14px;
        line-height: 1.7;
    }

    &__count {
        margin-top: 14px;
        color: #8a3f18;
        font-size: 13px;
        font-weight: 700;
    }

    &__kinds {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px;
        margin-top: 8px;

        li {
            padding: 3px 8px;
            border-radius: 999px;
            background: #fff0e5;
            color: #9d4215;
            font-size: 12px;
            font-weight: 700;
        }
    }

    &__recommendation {
        width: 100%;
        margin-top: 20px;
        padding: 14px;
        border-radius: 8px;
        background: #f7f3ef;
        text-align: left;

        h3 {
            color: #543829;
            font-size: 14px;
        }

        p {
            margin-top: 6px;
            color: #685b53;
            font-size: 13px;
            line-height: 1.7;
        }
    }

    &__details {
        width: 100%;
        margin-top: 16px;
        color: #5d534d;
        font-size: 13px;
        text-align: left;

        summary {
            cursor: pointer;
            font-weight: 700;
        }

        ul {
            display: grid;
            gap: 6px;
            margin-top: 10px;
        }

        li {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 8px;
            border-radius: 6px;
            background: #faf8f6;
        }

        code {
            overflow-wrap: anywhere;
        }

        li > div {
            display: grid;
            flex: 0 0 auto;
            justify-items: end;
            gap: 3px;
        }

        span {
            color: #9d4215;
        }

        small {
            max-width: 190px;
            overflow-wrap: anywhere;
            color: #766b64;
            font-size: 11px;
        }

        > p {
            margin-top: 8px;
        }
    }
}
</style>
