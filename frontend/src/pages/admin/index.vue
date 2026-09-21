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
} from '@/upload/uploadApi'
import { UploadManager, type UploadSnapshot } from '@/upload/uploadManager'

const router = useRouter()
const adminAuth = useAdminAuthStore()
const work = ref<ParsedWork | null>(null)
const errorMessage = ref('')
const isParsing = ref(false)
const quality = ref(0.85)
const isAuthorizing = ref(true)
const uploadManager = shallowRef<UploadManager | null>(null)
const uploadSnapshot = ref<UploadSnapshot | null>(null)
const isUploadRunning = ref(false)
const isPaused = ref(false)
const isPublished = ref(false)

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
    errorMessage.value =
        error instanceof Error ? error.message : 'Uploadに失敗しました。'
}

const finalizeUpload = async () => {
    if (!work.value) return
    // Clientの成功数だけで公開せず、BackendにS3 objectを再確認させてからmetadataを確定する。
    await completeUploadedWork(work.value)
    isPublished.value = true
}

const startUpload = async () => {
    if (!work.value || isUploadRunning.value) return
    errorMessage.value = ''
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
    try {
        await uploadManager.value.retryFailed()
        const snapshot = uploadManager.value.snapshot()
        if (snapshot.uploaded === snapshot.total && snapshot.failed === 0) {
            await finalizeUpload()
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
            <button type="button" @click="logout">管理ログアウト</button>
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
    &__header > div,
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
