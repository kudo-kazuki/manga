import type { PresignBatch, PresignResponse } from './presignBatches'

export class AdminAuthenticationError extends Error {
    public override readonly name = 'AdminAuthenticationError'
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
