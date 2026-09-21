<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
    loadMangaMetadata,
    MangaAuthenticationError,
    type MangaMetadata,
} from '@/manga/api'

const route = useRoute()
const router = useRouter()
const metadata = ref<MangaMetadata | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const workId =
    typeof route.params.workId === 'string' ? route.params.workId : ''

const loadWork = async () => {
    isLoading.value = true
    errorMessage.value = ''
    try {
        metadata.value = await loadMangaMetadata(workId)
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
                : '作品の取得に失敗しました。'
    } finally {
        isLoading.value = false
    }
}

onMounted(loadWork)
</script>

<template>
    <main class="WorkPage">
        <router-link class="WorkPage__back" to="/">← 作品一覧</router-link>
        <p v-if="isLoading" class="WorkPage__state">読み込み中…</p>
        <section v-else-if="errorMessage" class="WorkPage__error" role="alert">
            <p>{{ errorMessage }}</p>
            <button type="button" @click="loadWork">再読み込み</button>
        </section>
        <template v-else-if="metadata">
            <header>
                <p>WORK</p>
                <h1>{{ metadata.title }}</h1>
            </header>
            <ol class="WorkPage__chapters">
                <li v-for="chapter in metadata.chapters" :key="chapter.id">
                    <router-link
                        :to="`/works/${encodeURIComponent(metadata.id)}/${encodeURIComponent(chapter.id)}`"
                    >
                        <span>{{ chapter.title }}</span>
                        <small>{{ chapter.pages }} pages</small>
                    </router-link>
                </li>
            </ol>
        </template>
    </main>
</template>

<style scoped lang="scss">
.WorkPage {
    width: min(100%, 880px);
    min-height: 100%;
    margin: 0 auto;
    padding: 32px 24px 80px;

    &__back {
        color: #716d65;
        font-size: 13px;
        text-decoration: none;
    }

    header {
        margin-top: 28px;

        p {
            color: #85734c;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.16em;
        }

        h1 {
            margin-top: 4px;
            font-size: 30px;
        }
    }

    &__chapters {
        display: grid;
        gap: 10px;
        margin-top: 28px;
        padding: 0;
        list-style: none;

        a {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 18px;
            border: 1px solid #e2ded5;
            border-radius: 10px;
            background: #fff;
            color: #302e2a;
            text-decoration: none;
        }

        small {
            color: #857f75;
        }
    }

    &__state,
    &__error {
        margin-top: 28px;
    }

    &__error {
        color: #b42318;

        button {
            margin-top: 12px;
        }
    }

    @media (max-width: 700px) {
        padding: 24px 16px 64px;
    }
}
</style>
