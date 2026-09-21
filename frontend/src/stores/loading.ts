import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLoadingStore = defineStore('loading', () => {
    const isLoading = ref(false)
    const progress = ref(0)
    const message = ref('読み込み中...')

    const start = (nextMessage = '読み込み中...') => {
        message.value = nextMessage
        progress.value = 0
        isLoading.value = true
    }

    const update = (nextProgress: number) => {
        // 呼び出し元の計算誤差があっても、画面へ0～100以外を表示しない。
        progress.value = Math.min(100, Math.max(0, nextProgress))
    }

    const finish = () => {
        progress.value = 100
        isLoading.value = false
    }

    return { isLoading, progress, message, start, update, finish }
})
