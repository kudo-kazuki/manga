export interface MangaIndexEntry {
    readonly id: string
    readonly title: string
    readonly chapterCount: number
    readonly updatedAt: string
}

const SAFE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export interface MangaIndex {
    readonly works: readonly MangaIndexEntry[]
}

export interface MangaChapter {
    readonly id: string
    readonly title: string
    readonly pages: number
}

export interface MangaMetadata {
    readonly id: string
    readonly title: string
    readonly chapters: readonly MangaChapter[]
    readonly updatedAt: string
}

export class MangaAuthenticationError extends Error {
    public override readonly name = 'MangaAuthenticationError'
}

export class MangaNotFoundError extends Error {
    public override readonly name = 'MangaNotFoundError'
}

export class MangaDataError extends Error {
    public override readonly name = 'MangaDataError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIndexEntry(value: unknown): value is MangaIndexEntry {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        SAFE_ID.test(value.id) &&
        typeof value.title === 'string' &&
        typeof value.chapterCount === 'number' &&
        Number.isSafeInteger(value.chapterCount) &&
        value.chapterCount > 0 &&
        typeof value.updatedAt === 'string'
    )
}

function isChapter(value: unknown): value is MangaChapter {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        SAFE_ID.test(value.id) &&
        typeof value.title === 'string' &&
        typeof value.pages === 'number' &&
        Number.isSafeInteger(value.pages) &&
        value.pages > 0
    )
}

async function fetchPrivateJson(path: string): Promise<unknown> {
    let response: Response
    try {
        response = await fetch(path, { credentials: 'include' })
    } catch {
        throw new Error('通信に失敗しました。')
    }
    if (response.status === 401 || response.status === 403) {
        throw new MangaAuthenticationError('閲覧セッションが切れました。')
    }
    if (response.status === 404) {
        throw new MangaNotFoundError('作品が見つかりません。')
    }
    if (!response.ok) throw new Error('漫画データの取得に失敗しました。')
    try {
        return await response.json()
    } catch {
        throw new MangaDataError('漫画データが壊れています。')
    }
}

export async function loadMangaIndex(): Promise<MangaIndex> {
    const value = await fetchPrivateJson('/manga/index.json')
    if (
        !isRecord(value) ||
        !Array.isArray(value.works) ||
        !value.works.every(isIndexEntry)
    ) {
        throw new MangaDataError('作品一覧データが壊れています。')
    }
    return { works: value.works }
}

export async function loadMangaMetadata(
    workId: string,
): Promise<MangaMetadata> {
    if (!SAFE_ID.test(workId)) {
        throw new MangaNotFoundError('作品が見つかりません。')
    }
    // route parameterをURLへ入れる前にencodeし、意図しないpathへrequestしない。
    const value = await fetchPrivateJson(
        `/manga/${encodeURIComponent(workId)}/metadata.json`,
    )
    if (
        !isRecord(value) ||
        value.id !== workId ||
        typeof value.title !== 'string' ||
        !Array.isArray(value.chapters) ||
        !value.chapters.every(isChapter) ||
        typeof value.updatedAt !== 'string'
    ) {
        throw new MangaDataError('作品metadataが壊れています。')
    }
    return {
        id: value.id,
        title: value.title,
        chapters: value.chapters,
        updatedAt: value.updatedAt,
    }
}

export function createPageImageUrl(
    workId: string,
    chapterId: string,
    pageNumber: number,
): string {
    const fileName = `${String(pageNumber).padStart(3, '0')}.webp`
    return `/manga/${encodeURIComponent(workId)}/${encodeURIComponent(chapterId)}/${fileName}`
}

export type ImageLoadFailure = 'authentication' | 'not-found' | 'network'

export async function diagnoseImageLoadFailure(
    imageUrl: string,
): Promise<ImageLoadFailure> {
    try {
        // img要素ではstatusを参照できないため、失敗した画像だけHEADで原因を分類する。
        // 正常画像には追加requestを発生させない。
        const response = await fetch(imageUrl, {
            method: 'HEAD',
            credentials: 'include',
        })
        if (response.status === 401 || response.status === 403) {
            return 'authentication'
        }
        if (response.status === 404) return 'not-found'
        return 'network'
    } catch {
        return 'network'
    }
}
