<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
    deleteAdminWork,
    loadAdminWorks,
    type AdminWorkEntry,
} from '@/admin/worksApi'
import { useAdminAuthStore } from '@/stores/adminAuth'
import { AdminAuthenticationError } from '@/upload/uploadApi'

const router = useRouter()
const adminAuth = useAdminAuthStore()
const works = ref<readonly AdminWorkEntry[]>([])
const selectedWork = ref<AdminWorkEntry | null>(null)
const isLoading = ref(true)
const isDeleting = ref(false)
const errorMessage = ref('')

const isDialogOpen = computed({
    get: () => selectedWork.value !== null,
    set: (open: boolean) => {
        // DELETE中はoverlay clickやEscapeでもmodalを閉じず、結果が不明な連続操作を防ぐ。
        if (!open && !isDeleting.value) selectedWork.value = null
    },
})

const handleAuthError = async (error: unknown): Promise<boolean> => {
    if (!(error instanceof AdminAuthenticationError)) return false
    await router.replace('/admin/login')
    return true
}

const refreshWorks = async () => {
    isLoading.value = true
    errorMessage.value = ''
    try {
        works.value = await loadAdminWorks()
    } catch (error) {
        if (await handleAuthError(error)) return
        errorMessage.value =
            error instanceof Error
                ? error.message
                : '作品一覧の取得に失敗しました。'
    } finally {
        isLoading.value = false
    }
}

onMounted(async () => {
    if (!(await adminAuth.checkSession())) {
        await router.replace('/admin/login')
        return
    }
    await refreshWorks()
})

const openConfirmation = (work: AdminWorkEntry) => {
    if (isDeleting.value) return
    selectedWork.value = work
}

const closeConfirmation = () => {
    if (!isDeleting.value) selectedWork.value = null
}

const beforeDialogClose = (done: () => void) => {
    if (!isDeleting.value) done()
}

const confirmDelete = async () => {
    // disabled属性だけに頼らずhandler側でもguardし、連打や二重eventでDELETEを重ねない。
    const work = selectedWork.value
    if (!work || isDeleting.value) return
    isDeleting.value = true
    errorMessage.value = ''
    try {
        await deleteAdminWork(work.id)
        works.value = works.value.filter((entry) => entry.id !== work.id)
        selectedWork.value = null
    } catch (error) {
        if (await handleAuthError(error)) return
        errorMessage.value =
            error instanceof Error
                ? error.message
                : '作品の削除に失敗しました。'
    } finally {
        isDeleting.value = false
    }
}
</script>

<template>
    <main class="DeletePage">
        <header class="DeletePage__header">
            <div>
                <p>ADMIN</p>
                <h1>作品削除</h1>
            </div>
            <router-link to="/admin">管理メニューへ</router-link>
        </header>

        <p class="DeletePage__notice">
            削除すると作品の画像とmetadataを元に戻せません。
        </p>
        <p v-if="isLoading" class="DeletePage__state">作品一覧を読込中…</p>
        <p v-if="errorMessage" class="DeletePage__error" role="alert">
            {{ errorMessage }}
        </p>
        <p
            v-else-if="!isLoading && works.length === 0"
            class="DeletePage__state"
        >
            削除できる作品はありません。
        </p>

        <ul v-else class="DeletePage__works">
            <li v-for="work in works" :key="work.id">
                <div>
                    <strong>{{ work.title }}</strong>
                    <span>{{ work.chapterCount }} chapters</span>
                </div>
                <button
                    type="button"
                    :disabled="isDeleting"
                    @click="openConfirmation(work)"
                >
                    削除
                </button>
            </li>
        </ul>

        <el-dialog
            v-model="isDialogOpen"
            title="作品を削除しますか？"
            width="min(92vw, 460px)"
            :close-on-click-modal="!isDeleting"
            :close-on-press-escape="!isDeleting"
            :show-close="!isDeleting"
            :before-close="beforeDialogClose"
        >
            <p>
                「{{
                    selectedWork?.title
                }}」の画像とmetadataを完全に削除します。
                この操作は取り消せません。
            </p>
            <template #footer>
                <div class="DeletePage__dialogActions">
                    <button
                        type="button"
                        :disabled="isDeleting"
                        @click="closeConfirmation"
                    >
                        キャンセル
                    </button>
                    <button
                        class="DeletePage__confirm"
                        type="button"
                        :disabled="isDeleting"
                        @click="confirmDelete"
                    >
                        {{ isDeleting ? '削除中…' : '削除する' }}
                    </button>
                </div>
            </template>
        </el-dialog>
    </main>
</template>

<style scoped lang="scss">
.DeletePage {
    width: min(100%, 880px);
    min-height: 100%;
    padding: 24px;
    margin: 0 auto;

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

        a {
            color: #314a78;
            font-size: 13px;
        }
    }

    &__notice,
    &__state,
    &__error {
        margin-top: 24px;
    }

    &__notice {
        padding: 12px 14px;
        border-radius: 8px;
        background: #fff4e5;
        color: #8a4b08;
    }

    &__error {
        color: #b42318;
    }

    &__works {
        display: grid;
        gap: 10px;
        padding: 0;
        margin-top: 24px;
        list-style: none;

        li {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 16px 18px;
            border: 1px solid #e2ded5;
            border-radius: 10px;
            background: #fff;
        }

        li > div {
            display: grid;
            gap: 4px;
        }

        span {
            color: #716d65;
            font-size: 12px;
        }

        button {
            padding: 7px 12px;
            border: 1px solid #d92d20;
            border-radius: 8px;
            background: #fff;
            color: #b42318;
            cursor: pointer;
        }
    }

    button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }

    &__dialogActions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;

        button {
            padding: 8px 14px;
            border: 1px solid #d8d4cc;
            border-radius: 8px;
            background: #fff;
            cursor: pointer;
        }

        .DeletePage__confirm {
            border-color: #b42318;
            background: #b42318;
            color: #fff;
        }
    }
}
</style>
