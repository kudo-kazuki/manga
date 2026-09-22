<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
    loadMangaIndex,
    MangaAuthenticationError,
    type MangaIndexEntry,
} from '@/manga/api'

const route = useRoute()
const router = useRouter()
const works = ref<readonly MangaIndexEntry[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

const loadWorks = async () => {
    isLoading.value = true
    errorMessage.value = ''
    try {
        works.value = (await loadMangaIndex()).works
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
                : '作品一覧の取得に失敗しました。'
    } finally {
        isLoading.value = false
    }
}

onMounted(loadWorks)
</script>

<template>
    <!-- 未認証の403を受けるまで作品一覧の見出し・カードをDOMへ出さない。 -->
    <main
        v-if="isLoading"
        class="LibraryPage LibraryPage--loading"
        aria-busy="true"
    >
        <p class="LibraryPage__loadingLabel">認証を確認中…</p>
    </main>
    <main v-else class="LibraryPage">
        <header>
            <p class="LibraryPage__eyebrow">PRIVATE LIBRARY</p>
            <h1>作品一覧</h1>
        </header>

        <section v-if="errorMessage" class="LibraryPage__error" role="alert">
            <p>{{ errorMessage }}</p>
            <button type="button" @click="loadWorks">再読み込み</button>
        </section>
        <p v-else-if="works.length === 0" class="LibraryPage__state">
            公開済みの作品はまだありません。
        </p>
        <div v-else class="LibraryPage__works">
            <router-link
                v-for="work in works"
                :key="work.id"
                class="LibraryPage__work"
                :to="`/works/${encodeURIComponent(work.id)}`"
            >
                <h2>{{ work.title }}</h2>
                <p>{{ work.chapterCount }} chapters</p>
            </router-link>
        </div>
    </main>
</template>

<style scoped lang="scss">
.LibraryPage {
    width: min(100%, 1120px);
    min-height: 100%;
    margin: 0 auto;
    padding: 36px 24px 80px;

    &--loading {
        display: grid;
        place-items: center;
    }

    &__loadingLabel {
        color: #716d65;
        font-size: 13px;
    }

    &__eyebrow {
        color: #85734c;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
    }

    h1 {
        margin-top: 4px;
        font-size: 28px;
        font-weight: 700;
    }

    &__works {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 18px;
        margin-top: 28px;
    }

    &__work {
        min-height: 130px;
        padding: 22px;
        border: 1px solid #e2ded5;
        border-radius: 14px;
        background: #fff;
        color: #302e2a;
        text-decoration: none;
        box-shadow: 0 8px 24px rgba(48, 46, 42, 0.05);
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;

        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 28px rgba(48, 46, 42, 0.1);
        }

        h2 {
            font-size: 19px;
            font-weight: 700;
        }

        p {
            margin-top: 12px;
            color: #716d65;
            font-size: 13px;
        }
    }

    &__state,
    &__error {
        margin-top: 28px;
        color: #6f6a60;
    }

    &__error {
        color: #b42318;

        button {
            margin-top: 12px;
            padding: 7px 12px;
            border: 1px solid #d8d4cc;
            border-radius: 8px;
            background: #fff;
            cursor: pointer;
        }
    }

    @media (max-width: 700px) {
        padding: 24px 16px 64px;

        h1 {
            font-size: 24px;
        }
    }
}
</style>
