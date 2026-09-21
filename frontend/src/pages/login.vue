<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const username = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)
const isShaking = ref(false)

const shakeForm = async () => {
    isShaking.value = false
    await nextTick()
    isShaking.value = true
}

const submit = async () => {
    if (isSubmitting.value) {
        return
    }

    isSubmitting.value = true
    errorMessage.value = ''

    const isValid = await authStore.login(username.value, password.value)

    if (isValid) {
        await router.replace('/')
        return
    }

    errorMessage.value = 'ユーザー名またはパスワードが違います。'
    isSubmitting.value = false
    await shakeForm()
}
</script>

<template>
    <main class="LoginPage">
        <section
            class="LoginPage__panel"
            :class="{
                'animate__animated animate__shakeX': isShaking,
            }"
            @animationend="isShaking = false"
        >
            <img
                class="LoginPage__logo"
                src="@/assets/images/fire.gif"
                alt=""
            />
            <h1 class="LoginPage__title">Novels</h1>
            <p class="LoginPage__description">ログインしてください。</p>

            <form class="LoginPage__form" @submit.prevent="submit">
                <label class="LoginPage__field">
                    <span class="LoginPage__label">ユーザー名</span>
                    <el-input
                        v-model="username"
                        name="username"
                        autocomplete="username"
                        autofocus
                    />
                </label>

                <label class="LoginPage__field">
                    <span class="LoginPage__label">パスワード</span>
                    <el-input
                        v-model="password"
                        type="password"
                        name="password"
                        autocomplete="current-password"
                        show-password
                    />
                </label>

                <p v-if="errorMessage" class="LoginPage__error" role="alert">
                    {{ errorMessage }}
                </p>

                <Button
                    class="LoginPage__submit"
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
.LoginPage {
    display: grid;
    place-items: center;
    min-height: 100%;
    padding: 24px;

    &__panel {
        width: min(100%, 380px);
        padding: 32px;
        border: 1px solid #e4e1da;
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 10px 30px rgba(48, 46, 42, 0.08);
        text-align: center;
    }

    &__logo {
        width: 48px;
        height: 48px;
        border-radius: 10px;
    }

    &__title {
        margin-top: 10px;
        color: #302e2a;
        font-size: 26px;
        font-weight: 700;
        letter-spacing: 0.04em;
    }

    &__description {
        margin-top: 6px;
        color: #716d65;
        font-size: 14px;
    }

    &__form {
        display: grid;
        gap: 18px;
        margin-top: 28px;
        text-align: left;
    }

    &__field {
        display: grid;
        gap: 7px;
    }

    &__label {
        color: #45413b;
        font-size: 13px;
        font-weight: 700;
    }

    &__error {
        margin: -4px 0 0;
        color: #c11d1d;
        font-size: 13px;
    }

    &__submit {
        width: 100px;
        margin: 2px auto 0;
    }
}
</style>
