import type { PresignBatch, PresignResponse } from './presignBatches'
import type { ParsedWork } from './types'

export class AdminAuthenticationError extends Error {
    public override readonly name = 'AdminAuthenticationError'
}

export class UploadCompletionError extends Error {
    public override readonly name = 'UploadCompletionError'
}

export interface CompleteUploadResponse {
    readonly ok: true
    readonly work: {
        readonly id: string
        readonly title: string
        readonly chapterCount: number
    }
}

export async function requestPresignedFiles(
    batch: PresignBatch,
): Promise<PresignResponse> {
    const response = await fetch('/api/upload/presign', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(batch),
    })
    if (response.status === 401 || response.status === 403) {
        throw new AdminAuthenticationError('管理セッションが切れました。')
    }
    if (!response.ok) throw new Error('Upload URLの取得に失敗しました。')
    return (await response.json()) as PresignResponse
}

export async function putPresignedObject(
    uploadUrl: string,
    blob: Blob,
): Promise<void> {
    // Presign時と同じheaderを送り、画像binaryはLambdaを経由せずS3へ直接PUTする。
    const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'content-type': 'image/webp',
            'cache-control': 'public, max-age=31536000, immutable',
        },
        body: blob,
    })
    if (!response.ok) {
        throw new Error(`S3 PUTに失敗しました (${response.status})`)
    }
}

export async function completeUploadedWork(
    work: ParsedWork,
): Promise<CompleteUploadResponse> {
    const response = await fetch('/api/upload/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            workId: work.id,
            title: work.title,
            chapters: work.chapters.map((chapter) => ({
                id: chapter.id,
                title: chapter.title,
                pages: chapter.pages.length,
            })),
        }),
    })
    if (response.status === 401 || response.status === 403) {
        throw new AdminAuthenticationError('管理セッションが切れました。')
    }
    if (response.status === 409) {
        throw new UploadCompletionError(
            'S3上で未確認の画像があります。少し待ってmetadata確定を再試行してください。',
        )
    }
    if (!response.ok) {
        throw new UploadCompletionError('metadataの確定に失敗しました。')
    }
    return (await response.json()) as CompleteUploadResponse
}
