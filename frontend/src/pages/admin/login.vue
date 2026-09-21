<script setup lang="ts">
import { ref } from 'vue'
import { useAdminAuthStore } from '@/stores/adminAuth'

const router = useRouter()
const adminAuth = useAdminAuthStore()
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

const submit = async () => {
    if (isSubmitting.value) return
    isSubmitting.value = true
    errorMessage.value = ''
    const result = await adminAuth.login(password.value)
    if (result === 'success') {
        await router.replace('/admin')
        return
    }
    errorMessage.value =
        result === 'invalid-credentials'
            ? '管理パスワードが違います。'
            : '通信に失敗しました。時間をおいて再度お試しください。'
    isSubmitting.value = false
}
</script>

<template>
    <main class="AdminLogin">
        <section class="AdminLogin__panel">
            <p class="AdminLogin__eyebrow">ADMIN</p>
            <h1>管理者ログイン</h1>
            <form @submit.prevent="submit">
                <label>
                    <span>管理パスワード</span>
                    <el-input
                        v-model="password"
                        type="password"
                        autocomplete="current-password"
                        autofocus
                        show-password
                    />
                </label>
                <p v-if="errorMessage" class="AdminLogin__error" role="alert">
                    {{ errorMessage }}
                </p>
                <Button
                    color="navy"
                    size="s"
                    native-type="submit"
                    :is-disabled="isSubmitting"
                >
                    {{ isSubmitting ? '確認中…' : 'ログイン' }}
                </Button>
            </form>
        </section>
    </main>
</template>

<style scoped lang="scss">
.AdminLogin {
    display: grid;
    min-height: 100%;
    padding: 24px;
    place-items: center;

    &__panel {
        width: min(100%, 420px);
        padding: 32px;
        border: 1px solid #e4e1da;
        border-radius: 14px;
        background: #fff;
    }

    &__eyebrow {
        color: #85734c;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
    }

    h1 {
        margin-top: 6px;
        font-size: 26px;
    }

    form,
    label {
        display: grid;
        gap: 10px;
    }

    form {
        margin-top: 28px;
    }

    label span {
        font-size: 13px;
        font-weight: 700;
    }

    &__error {
        color: #c11d1d;
        font-size: 13px;
    }
}
</style>
