import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminAuthenticationError } from '@/upload/uploadApi'
import { deleteAdminWork, loadAdminWorks } from './worksApi'

afterEach(() => vi.restoreAllMocks())

describe('admin works API', () => {
    it('管理Cookie込みで作品一覧を取得する', async () => {
        const works = [
            {
                id: 'sample-one',
                title: 'サンプル',
                chapterCount: 2,
                updatedAt: '2026-09-22T00:00:00.000Z',
            },
        ]
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ ok: true, works }), {
                status: 200,
            }),
        )

        await expect(loadAdminWorks()).resolves.toEqual(works)
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/works', {
            credentials: 'include',
        })
    })

    it('workIdをencodeしてDELETEを1回送る', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('{}', { status: 200 }))

        await deleteAdminWork('sample-one')

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/works/sample-one', {
            method: 'DELETE',
            credentials: 'include',
        })
    })

    it('session切れを専用errorにする', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('', { status: 401 }),
        )

        await expect(loadAdminWorks()).rejects.toBeInstanceOf(
            AdminAuthenticationError,
        )
    })
})
