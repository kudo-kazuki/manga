<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminAuthStore } from '@/stores/adminAuth'
import { useDocumentTitle } from '@/composables/useDocumentTitle'

const router = useRouter()
const adminAuth = useAdminAuthStore()
const isAuthorizing = ref(true)

useDocumentTitle('管理メニュー')
const isLocalDeployConsoleVisible = computed(
    () =>
        import.meta.env.DEV &&
        ['localhost', '127.0.0.1'].includes(window.location.hostname),
)

onMounted(async () => {
    // 管理menuも個別画面と同じく、Cookie本体は読まず有効なsessionだけを確認する。
    if (!(await adminAuth.checkSession())) {
        await router.replace('/admin/login')
        return
    }
    isAuthorizing.value = false
})

const logout = async () => {
    await adminAuth.logout()
    await router.replace('/admin/login')
}
</script>

<template>
    <main v-if="isAuthorizing" class="AdminMenu AdminMenu--loading">
        管理セッションを確認中…
    </main>
    <main v-else class="AdminMenu">
        <header class="AdminMenu__header">
            <div>
                <p>ADMIN</p>
                <h1>管理メニュー</h1>
            </div>
            <button type="button" @click="logout">管理ログアウト</button>
        </header>

        <p class="AdminMenu__lead">実行する作業を選んでください。</p>
        <nav class="AdminMenu__links" aria-label="管理作業">
            <router-link to="/admin/upload">
                <strong>漫画アップロード</strong>
                <span>作品フォルダを選び、WebP変換とuploadを開始します。</span>
            </router-link>
            <router-link to="/admin/delete">
                <strong>作品削除</strong>
                <span>公開済み作品を一覧から選び、確認後に削除します。</span>
            </router-link>
            <router-link v-if="isLocalDeployConsoleVisible" to="/local/deploy">
                <strong>ローカル deploy console</strong>
                <span>Backend LambdaまたはFrontend配信だけを実行します。</span>
            </router-link>
        </nav>
        <p v-if="isLocalDeployConsoleVisible" class="AdminMenu__localNotice">
            deploy consoleはlocal開発環境だけに表示されます。
        </p>
    </main>
</template>

<style scoped lang="scss">
.AdminMenu {
    width: min(100%, 880px);
    min-height: 100%;
    padding: 24px;
    margin: 0 auto;

    &--loading {
        display: grid;
        place-items: center;
    }

    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;

        p {
            color: #85734c;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.16em;
        }

        button {
            padding: 7px 12px;
            border: 1px solid #d8d4cc;
            border-radius: 8px;
            background: #fff;
            color: #4b4944;
            cursor: pointer;
        }
    }

    &__lead {
        margin-top: 28px;
        color: #625f59;
    }

    &__links {
        display: grid;
        gap: 12px;
        margin-top: 18px;

        a {
            display: grid;
            gap: 7px;
            padding: 20px;
            border: 1px solid #dfdcd5;
            border-radius: 10px;
            background: #fff;
            color: #302e2a;
            text-decoration: none;
            transition:
                border-color 0.2s ease,
                background-color 0.2s ease;
        }

        a:hover {
            border-color: #9baac0;
            background: #f8fbff;
        }

        strong {
            font-size: 17px;
        }

        span {
            color: #6a6761;
            font-size: 13px;
            line-height: 1.6;
        }
    }

    &__localNotice {
        margin-top: 16px;
        color: #8a5b22;
        font-size: 12px;
    }
}
</style>
