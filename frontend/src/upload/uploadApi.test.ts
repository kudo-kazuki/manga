import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ParsedWork } from './types'
import { completeUploadedWork, UploadCompletionError } from './uploadApi'

const work: ParsedWork = {
    id: 'work-test',
    title: '作品',
    chapters: [
        {
            id: '001',
            title: '1巻',
            pages: [
                {
                    id: '001',
                    fileName: '001.webp',
                    originalName: '1.jpg',
                    relativePath: '作品/1巻/1.jpg',
                    file: new File(['image'], '1.jpg'),
                },
            ],
        },
    ],
    totalImages: 1,
    totalBytes: 5,
    warnings: [],
}

afterEach(() => vi.restoreAllMocks())

describe('Upload complete API', () => {
    it('表示名とpage数だけをcomplete APIへ送る', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    ok: true,
                    work: { id: 'work-test', title: '作品', chapterCount: 1 },
                }),
                { status: 200 },
            ),
        )

        await completeUploadedWork(work)

        expect(fetchMock).toHaveBeenCalledWith('/api/upload/complete', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                workId: 'work-test',
                title: '作品',
                chapters: [{ id: '001', title: '1巻', pages: 1 }],
            }),
        })
    })

    it('画像不足responseをmetadata確定エラーとして区別する', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('', { status: 409 }),
        )

        await expect(completeUploadedWork(work)).rejects.toBeInstanceOf(
            UploadCompletionError,
        )
    })
})
