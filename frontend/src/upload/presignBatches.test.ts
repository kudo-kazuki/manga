import { describe, expect, it } from 'vitest'
import { createPresignBatches, PRESIGN_BATCH_SIZE } from './presignBatches'
import type { ParsedChapter, ParsedPage, ParsedWork } from './types'

function chapter(id: string, pageCount: number): ParsedChapter {
    const pages: ParsedPage[] = Array.from(
        { length: pageCount },
        (_, index) => {
            const pageId = String(index + 1).padStart(3, '0')
            return {
                id: pageId,
                fileName: `${pageId}.webp`,
                originalName: `${index + 1}.jpg`,
                relativePath: `作品/${id}/${index + 1}.jpg`,
                file: new File(['image'], `${index + 1}.jpg`, {
                    type: 'image/jpeg',
                }),
            }
        },
    )
    return { id, title: `${id}巻`, pages }
}

function work(chapters: readonly ParsedChapter[]): ParsedWork {
    return {
        id: 'work-abc123',
        title: '作品',
        chapters,
        totalImages: chapters.reduce(
            (total, item) => total + item.pages.length,
            0,
        ),
        totalBytes: 0,
        warnings: [],
    }
}

describe('createPresignBatches', () => {
    it('100件以下へ分割し、chapter境界をまたがない', () => {
        const batches = createPresignBatches(
            work([chapter('001', 250), chapter('002', 50)]),
        )

        expect(batches.map(({ chapterId }) => chapterId)).toEqual([
            '001',
            '001',
            '001',
            '002',
        ])
        expect(batches.map(({ files }) => files.length)).toEqual([
            100, 100, 50, 50,
        ])
        expect(
            batches.every(({ files }) => files.length <= PRESIGN_BATCH_SIZE),
        ).toBe(true)
    })

    it('正規化済みWebP filenameとcontent typeを送る', () => {
        const [batch] = createPresignBatches(work([chapter('001', 2)]))
        expect(batch).toEqual({
            workId: 'work-abc123',
            chapterId: '001',
            files: [
                { name: '001.webp', contentType: 'image/webp' },
                { name: '002.webp', contentType: 'image/webp' },
            ],
        })
    })

    it('50 chapter × 200 pagesを100件の小さなrequestへ分割する', () => {
        const chapters = Array.from({ length: 50 }, (_, index) =>
            chapter(String(index + 1).padStart(3, '0'), 200),
        )
        const batches = createPresignBatches(work(chapters))
        expect(batches).toHaveLength(100)
        expect(batches.flatMap(({ files }) => files)).toHaveLength(10_000)
    })
})
