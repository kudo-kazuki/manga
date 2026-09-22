<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
    createPageImageUrl,
    diagnoseImageLoadFailure,
    loadMangaMetadata,
    MangaAuthenticationError,
    type ImageLoadFailure,
    type MangaMetadata,
} from '@/manga/api'
import { useDocumentTitle } from '@/composables/useDocumentTitle'

const route = useRoute()
const router = useRouter()
const metadata = ref<MangaMetadata | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const imageError = ref<'' | ImageLoadFailure>('')
const { setDocumentTitle } = useDocumentTitle('漫画を読み込み中')
let isDiagnosingImage = false
let imageDiagnosisGeneration = 0

const workId = computed(() =>
    typeof route.params.workId === 'string' ? route.params.workId : '',
)
const chapterId = computed(() =>
    typeof route.params.chapterId === 'string' ? route.params.chapterId : '',
)
const chapterIndex = computed(
    () =>
        metadata.value?.chapters.findIndex(
            (chapter) => chapter.id === chapterId.value,
        ) ?? -1,
)
const chapter = computed(() =>
    chapterIndex.value < 0
        ? undefined
        : metadata.value?.chapters[chapterIndex.value],
)
const previousChapter = computed(() =>
    chapterIndex.value > 0
        ? metadata.value?.chapters[chapterIndex.value - 1]
        : undefined,
)
const nextChapter = computed(() =>
    metadata.value && chapterIndex.value < metadata.value.chapters.length - 1
        ? metadata.value.chapters[chapterIndex.value + 1]
        : undefined,
)
const pageUrls = computed(() =>
    chapter.value
        ? Array.from({ length: chapter.value.pages }, (_, index) =>
              createPageImageUrl(workId.value, chapter.value!.id, index + 1),
          )
        : [],
)

const chapterRoute = (targetChapterId: string) =>
    `/works/${encodeURIComponent(workId.value)}/${encodeURIComponent(targetChapterId)}`

const imageErrorMessage = computed(() => {
    if (imageError.value === 'authentication') {
        return '閲覧セッションが切れました。再ログインしてください。'
    }
    if (imageError.value === 'not-found') {
        return '画像が見つかりません。管理者へ確認してください。'
    }
    return '画像の通信に失敗しました。時間をおいて再読み込みしてください。'
})

const onImageError = async (url: string) => {
    if (isDiagnosingImage || imageError.value) return
    isDiagnosingImage = true
    const generation = imageDiagnosisGeneration
    const result = await diagnoseImageLoadFailure(url)
    // HEAD待機中に別chapterへ移動した場合、古い画像の結果を新しい画面へ表示しない。
    if (generation !== imageDiagnosisGeneration) return
    imageError.value = result
    isDiagnosingImage = false
}

const loadChapter = async () => {
    isLoading.value = true
    errorMessage.value = ''
    imageError.value = ''
    isDiagnosingImage = false
    imageDiagnosisGeneration += 1
    try {
        metadata.value = await loadMangaMetadata(workId.value)
        if (!chapter.value) {
            errorMessage.value = 'Chapterが見つかりません。'
        } else {
            setDocumentTitle(`${chapter.value.title} - ${metadata.value.title}`)
        }
    } catch (error) {
        if (error instanceof MangaAuthenticationError) {
            await router.replace({
                path: '/login',
                query: { redirect: route.fullPath },
            })
            return
        }
        errorMessage.value =
            error instanceof Error
                ? error.message
                : '漫画の取得に失敗しました。'
    } finally {
        isLoading.value = false
    }
}

// 同じViewer componentのまま前後chapterへ移動した場合もmetadataと位置を更新する。
watch(() => [workId.value, chapterId.value], loadChapter, { immediate: true })
</script>

<template>
    <main class="ViewerPage">
        <p v-if="isLoading" class="ViewerPage__state">読み込み中…</p>
        <section
            v-else-if="errorMessage"
            class="ViewerPage__error"
            role="alert"
        >
            <p>{{ errorMessage }}</p>
            <button type="button" @click="loadChapter">再読み込み</button>
        </section>
        <template v-else-if="metadata && chapter">
            <header class="ViewerPage__header">
                <router-link :to="`/works/${encodeURIComponent(metadata.id)}`">
                    ← Chapter一覧
                </router-link>
                <div>
                    <h1>{{ metadata.title }}</h1>
                    <p>{{ chapter.title }}</p>
                </div>
            </header>

            <p v-if="imageError" class="ViewerPage__imageError" role="alert">
                {{ imageErrorMessage }}
                <router-link
                    v-if="imageError === 'authentication'"
                    :to="{
                        path: '/login',
                        query: { redirect: route.fullPath },
                    }"
                >
                    再ログイン
                </router-link>
            </p>

            <section class="ViewerPage__pages" :aria-label="chapter.title">
                <img
                    v-for="(url, index) in pageUrls"
                    :key="url"
                    :src="url"
                    :alt="`${chapter.title} ${index + 1}ページ`"
                    :loading="index < 2 ? 'eager' : 'lazy'"
                    decoding="async"
                    @error="onImageError(url)"
                />
            </section>

            <nav class="ViewerPage__navigation" aria-label="Chapter移動">
                <router-link
                    v-if="previousChapter"
                    :to="chapterRoute(previousChapter.id)"
                >
                    ← {{ previousChapter.title }}
                </router-link>
                <span v-else></span>
                <router-link
                    v-if="nextChapter"
                    :to="chapterRoute(nextChapter.id)"
                >
                    {{ nextChapter.title }} →
                </router-link>
            </nav>
        </template>
    </main>
</template>

<style scoped lang="scss">
.ViewerPage {
    min-height: 100%;
    padding: 20px 16px 80px;
    background: #292824;

    &__header,
    &__navigation,
    &__state,
    &__error,
    &__imageError {
        width: min(100%, 980px);
        margin-right: auto;
        margin-left: auto;
    }

    &__header {
        display: flex;
        align-items: center;
        gap: 24px;
        margin-bottom: 20px;
        color: #fff;

        a {
            color: #d9d2c3;
            font-size: 13px;
            text-decoration: none;
        }

        h1 {
            font-size: 17px;
        }

        p {
            margin-top: 3px;
            color: #bdb7aa;
            font-size: 13px;
        }
    }

    &__pages {
        display: grid;
        gap: 4px;
        width: min(100%, 980px);
        margin: 0 auto;

        img {
            display: block;
            width: 100%;
            height: auto;
            min-height: 120px;
            background: #1d1c19;
        }
    }

    &__navigation {
        display: flex;
        justify-content: space-between;
        margin-top: 28px;

        a {
            padding: 10px 14px;
            border: 1px solid #5c5850;
            border-radius: 8px;
            color: #fff;
            text-decoration: none;
        }
    }

    &__state,
    &__error,
    &__imageError {
        color: #fff;
    }

    &__error,
    &__imageError {
        padding: 12px;
        border-radius: 8px;
        background: #4b2522;

        a {
            color: #fff;
            text-decoration: underline;
        }
    }

    &__imageError {
        margin-bottom: 16px;
    }

    @media (max-width: 700px) {
        padding: 14px 0 56px;

        &__header,
        &__navigation,
        &__state,
        &__error,
        &__imageError {
            width: auto;
            margin-right: 12px;
            margin-left: 12px;
        }
    }
}
</style>
