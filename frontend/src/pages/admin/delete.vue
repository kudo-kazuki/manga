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
const deletedWorkTitle = ref('')
const deleteFailureMessage = ref('')
const isDeleteSuccessDialogVisible = ref(false)
const isDeleteFailureDialogVisible = ref(false)

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
    // 前回の結果を残さず、今回のDELETE requestの結果だけをmodalへ表示する。
    isDeleteSuccessDialogVisible.value = false
    isDeleteFailureDialogVisible.value = false
    deleteFailureMessage.value = ''
    try {
        await deleteAdminWork(work.id)
        works.value = works.value.filter((entry) => entry.id !== work.id)
        selectedWork.value = null
        deletedWorkTitle.value = work.title
        isDeleteSuccessDialogVisible.value = true
    } catch (error) {
        if (await handleAuthError(error)) return
        deleteFailureMessage.value =
            error instanceof Error
                ? error.message
                : '作品の削除に失敗しました。'
        // DELETE APIは同じ作品IDへの再送を安全に扱えるため、途中で失敗しても再試行できる。
        isDeleteFailureDialogVisible.value = true
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
            <p v-if="!isDeleting">
                「{{
                    selectedWork?.title
                }}」の画像とmetadataを完全に削除します。
                この操作は取り消せません。
            </p>
            <section v-else class="DeletePage__deleting" role="status">
                <span class="DeletePage__spinner" aria-hidden="true"></span>
                <div>
                    <strong>作品を削除中です…</strong>
                    <p>
                        画像、metadata、公開cacheを順に削除しています。正確な件数進捗はAPIから取得できないため、完了までこの画面を閉じずにお待ちください。
                    </p>
                </div>
            </section>
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

        <Modal
            title="削除完了"
            size="m"
            :is-show="isDeleteSuccessDialogVisible"
            :is-text-center="true"
            @close="isDeleteSuccessDialogVisible = false"
        >
            <template #body>
                <section class="DeleteSuccessDialog">
                    <span class="DeleteSuccessDialog__check" aria-hidden="true">
                        ✓
                    </span>
                    <p class="DeleteSuccessDialog__eyebrow">DELETE COMPLETE</p>
                    <h2>作品を削除しました</h2>
                    <p>
                        「{{
                            deletedWorkTitle
                        }}」の画像、metadata、公開一覧を更新しました。
                    </p>
                </section>
            </template>
        </Modal>

        <Modal
            title="削除失敗"
            size="m"
            :is-show="isDeleteFailureDialogVisible"
            :is-text-center="true"
            @close="isDeleteFailureDialogVisible = false"
        >
            <template #body>
                <section class="DeleteFailureDialog">
                    <span class="DeleteFailureDialog__mark" aria-hidden="true">
                        !
                    </span>
                    <p class="DeleteFailureDialog__eyebrow">DELETE FAILED</p>
                    <h2>作品を削除できませんでした</h2>
                    <p>{{ deleteFailureMessage }}</p>
                    <section class="DeleteFailureDialog__recommendation">
                        <h3>次に行うこと</h3>
                        <p>
                            少し待ってから、確認画面の「削除する」をもう一度押してください。同じ作品の削除を再試行しても、すでに消えた画像を復元・重複削除することはありません。
                        </p>
                    </section>
                </section>
            </template>
        </Modal>
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

    &__deleting {
        display: flex;
        align-items: flex-start;
        gap: 12px;

        strong {
            color: #543829;
        }

        p {
            margin-top: 6px;
            color: #685b53;
            font-size: 13px;
            line-height: 1.7;
        }
    }

    &__spinner {
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        border: 3px solid #ead1be;
        border-top-color: #b95620;
        border-radius: 50%;
        animation: DeletePage-spin 0.8s linear infinite;
    }
}

@keyframes DeletePage-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>

<style scoped lang="scss">
.DeleteSuccessDialog,
.DeleteFailureDialog {
    display: grid;
    justify-items: center;
    padding: 10px 0 4px;
    text-align: center;
}

.DeleteSuccessDialog {
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

.DeleteFailureDialog {
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

    > p {
        margin-top: 12px;
        color: #685b53;
        font-size: 14px;
        line-height: 1.7;
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
}
</style>
