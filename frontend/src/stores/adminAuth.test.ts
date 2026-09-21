import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdminAuthStore } from './adminAuth'

describe('useAdminAuthStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.restoreAllMocks()
    })

    it('管理passwordをcredentials付きで送る', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('{}', { status: 200 }))

        await expect(useAdminAuthStore().login('admin-secret')).resolves.toBe(
            'success',
        )
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'admin-secret' }),
        })
    })

    it('管理sessionをHttpOnly Cookie込みで確認する', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('{}', { status: 200 }))

        await expect(useAdminAuthStore().checkSession()).resolves.toBe(true)
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/session', {
            credentials: 'include',
        })
    })
})
