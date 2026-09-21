import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './auth'

describe('useAuthStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.restoreAllMocks()
    })

    it('passwordだけをcredentials付きでlogin APIへ送る', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('{}', { status: 200 }))

        const result = await useAuthStore().login('secret')

        expect(result).toBe('success')
        expect(fetchMock).toHaveBeenCalledWith('/api/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'secret' }),
        })
    })

    it('401とnetwork errorを区別する', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
        fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }))
        await expect(useAuthStore().login('wrong')).resolves.toBe(
            'invalid-credentials',
        )

        fetchMock.mockRejectedValueOnce(new Error('offline'))
        await expect(useAuthStore().login('secret')).resolves.toBe(
            'network-error',
        )
    })

    it('logout APIをcredentials付きで呼ぶ', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('{}', { status: 200 }))

        await useAuthStore().logout()

        expect(fetchMock).toHaveBeenCalledWith('/api/logout', {
            method: 'POST',
            credentials: 'include',
        })
    })
})
