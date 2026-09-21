<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminAuthStore } from '@/stores/adminAuth'
import {
    collectDroppedFiles,
    collectSelectedFiles,
    parseWorkFiles,
} from '@/upload/folderParser'
import type { ParsedWork, RelativeImageFile } from '@/upload/types'

const router = useRouter()
const adminAuth = useAdminAuthStore()
const work = ref<ParsedWork | null>(null)
const errorMessage = ref('')
const isParsing = ref(false)
const quality = ref(0.85)
const isAuthorizing = ref(true)

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
                />
            </label>

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

            <p class="AdminPage__notice">
                WebP変換とS3アップロードの開始操作はPhase 4で接続します。
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
    &__drop label {
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

    @media (max-width: 700px) {
        dl {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
}
</style>
