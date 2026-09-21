import type { ParsedWork } from './types'

export const PRESIGN_BATCH_SIZE = 100

export interface PresignBatchFile {
    readonly name: string
    readonly contentType: 'image/webp'
}

export interface PresignBatch {
    readonly workId: string
    readonly chapterId: string
    readonly files: readonly PresignBatchFile[]
}

export interface PresignedFile {
    readonly key: string
    readonly uploadUrl: string
}

export interface PresignResponse {
    readonly files: readonly PresignedFile[]
}

export function createPresignBatches(work: ParsedWork): PresignBatch[] {
    const batches: PresignBatch[] = []

    for (const chapter of work.chapters) {
        // API requestはchapterIdを1つだけ持つため、chapter境界をまたいでまとめない。
        // 1万URLを一度に発行せず、各chapterをさらに100件以下へ分割する。
        for (
            let start = 0;
            start < chapter.pages.length;
            start += PRESIGN_BATCH_SIZE
        ) {
            batches.push({
                workId: work.id,
                chapterId: chapter.id,
                files: chapter.pages
                    .slice(start, start + PRESIGN_BATCH_SIZE)
                    .map((page) => ({
                        name: page.fileName,
                        contentType: 'image/webp' as const,
                    })),
            })
        }
    }

    return batches
}
