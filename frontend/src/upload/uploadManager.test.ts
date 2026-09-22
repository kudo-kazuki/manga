import { describe, expect, it, vi } from 'vitest'
import type { ParsedChapter, ParsedPage, ParsedWork } from './types'
import { UploadManager } from './uploadManager'
import { AdminAuthenticationError } from './uploadApi'

function createWork(pageCount: number): ParsedWork {
    const pages: ParsedPage[] = Array.from(
        { length: pageCount },
        (_, index) => {
            const id = String(index + 1).padStart(3, '0')
            return {
                id,
                fileName: `${id}.webp`,
                originalName: `${index + 1}.jpg`,
                relativePath: `作品/1巻/${index + 1}.jpg`,
                file: new File(['image'], `${index + 1}.jpg`, {
                    type: 'image/jpeg',
                }),
            }
        },
    )
    const chapter: ParsedChapter = { id: '001', title: '1巻', pages }
    return {
        id: 'work-test',
        title: '作品',
        chapters: [chapter],
        totalImages: pageCount,
        totalBytes: pageCount * 5,
        warnings: [],
    }
}

describe('UploadManager', () => {
    it('100件ずつPresignし、変換後のBlobをS3 PUTへ渡す', async () => {
        const batchSizes: number[] = []
        let active = 0
        let maxActive = 0
        const uploaded: string[] = []
        const manager = new UploadManager(createWork(205), {
            concurrency: 4,
            quality: 0.85,
            async requestPresign(batch) {
                batchSizes.push(batch.files.length)
                return {
                    files: batch.files.map((file) => ({
                        key: `manga/${batch.workId}/${batch.chapterId}/${file.name}`,
                        uploadUrl: `https://s3.example/${file.name}`,
                    })),
                }
            },
            async convert() {
                active += 1
                maxActive = Math.max(maxActive, active)
                await Promise.resolve()
                active -= 1
                return new Blob(['webp'])
            },
            async upload(url) {
                uploaded.push(url)
            },
        })

        await manager.run()

        expect(batchSizes).toEqual([100, 100, 5])
        expect(maxActive).toBeLessThanOrEqual(4)
        expect(uploaded).toHaveLength(205)
        expect(manager.snapshot()).toMatchObject({
            total: 205,
            uploaded: 205,
            failed: 0,
            pending: 0,
        })
    })

    it('失敗項目だけを新しいURLでRetryする', async () => {
        let failedOnce = false
        const requestedNames: string[][] = []
        const manager = new UploadManager(createWork(3), {
            concurrency: 2,
            quality: 0.85,
            async requestPresign(batch) {
                requestedNames.push(batch.files.map(({ name }) => name))
                return {
                    files: batch.files.map((file) => ({
                        key: `manga/work-test/001/${file.name}`,
                        uploadUrl: `https://s3.example/${file.name}`,
                    })),
                }
            },
            async convert(file) {
                if (file.name === '2.jpg' && !failedOnce) {
                    failedOnce = true
                    throw new Error('convert failed')
                }
                return new Blob(['webp'])
            },
            async upload() {},
        })

        await manager.run()
        expect(manager.snapshot().failed).toBe(1)
        expect(manager.snapshot().failures).toEqual([
            {
                relativePath: '作品/1巻/2.jpg',
                kind: 'conversion',
                message: 'convert failed',
            },
        ])
        await manager.retryFailed()
        expect(manager.snapshot().failed).toBe(0)
        expect(requestedNames).toEqual([
            ['001.webp', '002.webp', '003.webp'],
            ['002.webp'],
        ])
    })

    it('Pause中は次の画像を開始せず、Resume後に残りを再開する', async () => {
        let releaseFirstUpload: (() => void) | undefined
        let firstUploadStarted: (() => void) | undefined
        const started = new Promise<void>((resolve) => {
            firstUploadStarted = resolve
        })
        const blocked = new Promise<void>((resolve) => {
            releaseFirstUpload = resolve
        })
        const uploaded: string[] = []
        const manager = new UploadManager(createWork(3), {
            concurrency: 1,
            quality: 0.85,
            async requestPresign(batch) {
                return {
                    files: batch.files.map((file) => ({
                        key: `manga/work-test/001/${file.name}`,
                        uploadUrl: `https://s3.example/${file.name}`,
                    })),
                }
            },
            async convert() {
                return new Blob(['webp'])
            },
            async upload(url) {
                uploaded.push(url)
                if (uploaded.length === 1) {
                    firstUploadStarted?.()
                    await blocked
                }
            },
        })

        const running = manager.run()
        await started
        manager.pause()
        releaseFirstUpload?.()
        await Promise.resolve()
        await Promise.resolve()

        expect(uploaded).toHaveLength(1)
        expect(manager.snapshot().pending).toBe(2)

        manager.resume()
        await running
        expect(uploaded).toHaveLength(3)
        expect(manager.snapshot().uploaded).toBe(3)
    })

    it('管理認証切れを上位へ伝える', async () => {
        const manager = new UploadManager(createWork(1), {
            concurrency: 1,
            quality: 0.85,
            async requestPresign() {
                throw new AdminAuthenticationError('expired')
            },
            async convert() {
                return new Blob()
            },
            async upload() {},
        })
        await expect(manager.run()).rejects.toBeInstanceOf(
            AdminAuthenticationError,
        )
    })

    it('S3 PUT APIが署名対象headerとBlobを送る', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('', { status: 200 }))
        const { putPresignedObject } = await import('./uploadApi')
        const blob = new Blob(['webp'], { type: 'image/webp' })
        await putPresignedObject('https://s3.example/001.webp', blob)
        expect(fetchMock).toHaveBeenCalledWith(
            'https://s3.example/001.webp',
            expect.objectContaining({
                method: 'PUT',
                body: blob,
                headers: {
                    'content-type': 'image/webp',
                    'cache-control': 'public, max-age=31536000, immutable',
                },
            }),
        )
        vi.restoreAllMocks()
    })
})
