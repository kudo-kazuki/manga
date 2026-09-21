import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    createPageImageUrl,
    diagnoseImageLoadFailure,
    loadMangaIndex,
    MangaAuthenticationError,
    MangaDataError,
} from './api'

afterEach(() => vi.restoreAllMocks())

describe('Manga data API', () => {
    it('private indexをCookie付きで取得する', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    works: [
                        {
                            id: 'work-test',
                            title: '作品',
                            chapterCount: 2,
                            updatedAt: '2026-09-21T00:00:00.000Z',
                        },
                    ],
                }),
                { status: 200 },
            ),
        )

        expect((await loadMangaIndex()).works).toHaveLength(1)
        expect(fetchMock).toHaveBeenCalledWith('/manga/index.json', {
            credentials: 'include',
        })
    })

    it('403を認証切れとして区別する', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('', { status: 403 }),
        )
        await expect(loadMangaIndex()).rejects.toBeInstanceOf(
            MangaAuthenticationError,
        )
    })

    it('壊れたindexを空一覧として隠さない', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ works: [{ id: 'broken' }] }), {
                status: 200,
            }),
        )
        await expect(loadMangaIndex()).rejects.toBeInstanceOf(MangaDataError)
    })

    it('page数からzero padding済みURLを組み立てる', () => {
        expect(createPageImageUrl('work-test', '003', 2)).toBe(
            '/manga/work-test/003/002.webp',
        )
    })

    it.each([
        [403, 'authentication'],
        [404, 'not-found'],
        [500, 'network'],
    ] as const)(
        '画像失敗status %sを%sとして区別する',
        async (status, expected) => {
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(
                new Response('', { status }),
            )

            await expect(
                diagnoseImageLoadFailure('/manga/work/001/001.webp'),
            ).resolves.toBe(expected)
        },
    )
})
