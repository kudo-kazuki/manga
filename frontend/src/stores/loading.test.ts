import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLoadingStore } from './loading'

describe('useLoadingStore', () => {
    beforeEach(() => {
        // 各テストでstoreの状態が混ざらないよう、新しいPiniaを有効化する。
        setActivePinia(createPinia())
    })

    it('読み込みの開始と完了を管理する', () => {
        const store = useLoadingStore()

        store.start('画像を読み込み中...')

        expect(store.isLoading).toBe(true)
        expect(store.progress).toBe(0)
        expect(store.message).toBe('画像を読み込み中...')

        store.finish()

        expect(store.isLoading).toBe(false)
        expect(store.progress).toBe(100)
    })

    it('進捗値を0～100の範囲に収める', () => {
        const store = useLoadingStore()

        store.update(-1)
        expect(store.progress).toBe(0)

        store.update(42)
        expect(store.progress).toBe(42)

        store.update(101)
        expect(store.progress).toBe(100)
    })
})
