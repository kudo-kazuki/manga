import { RequestValidationError } from './validation.js'

const MAX_COMPLETE_BODY_BYTES = 256 * 1024
const MAX_CHAPTERS = 1_000
const MAX_TOTAL_PAGES = 100_000
const MAX_TITLE_LENGTH = 200
const SAFE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export interface MangaChapterMetadata {
    readonly id: string
    readonly title: string
    readonly pages: number
}

export interface CompleteUploadRequest {
    readonly workId: string
    readonly title: string
    readonly chapters: readonly MangaChapterMetadata[]
}

export interface MangaMetadata {
    readonly id: string
    readonly title: string
    readonly chapters: readonly MangaChapterMetadata[]
    readonly updatedAt: string
}

export interface MangaIndexEntry {
    readonly id: string
    readonly title: string
    readonly chapterCount: number
    readonly updatedAt: string
}

export interface MangaIndex {
    readonly works: readonly MangaIndexEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseId(value: unknown, fieldName: string): string {
    // S3 Keyへ埋め込むIDはallow-listで検証し、slashやpath traversalを構造的に防ぐ。
    if (typeof value !== 'string' || !SAFE_ID.test(value)) {
        throw new RequestValidationError(`${fieldName} is invalid`)
    }
    return value
}

export function parseWorkId(value: unknown): string {
    return parseId(value, 'workId')
}

function parseTitle(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
        throw new RequestValidationError(`${fieldName} is invalid`)
    }
    const title = value.trim()
    if (
        !title ||
        title.length > MAX_TITLE_LENGTH ||
        /[\u0000-\u001f]/u.test(title)
    ) {
        throw new RequestValidationError(`${fieldName} is invalid`)
    }
    return title
}

export function parseCompleteUploadRequest(
    body: string | undefined,
): CompleteUploadRequest {
    if (!body || Buffer.byteLength(body, 'utf8') > MAX_COMPLETE_BODY_BYTES) {
        throw new RequestValidationError('Request body is invalid')
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(body)
    } catch {
        throw new RequestValidationError('Request body must be valid JSON')
    }
    if (!isRecord(parsed)) {
        throw new RequestValidationError('Request body is invalid')
    }

    const workId = parseWorkId(parsed.workId)
    const title = parseTitle(parsed.title, 'title')
    if (
        !Array.isArray(parsed.chapters) ||
        parsed.chapters.length === 0 ||
        parsed.chapters.length > MAX_CHAPTERS
    ) {
        throw new RequestValidationError('chapters is invalid')
    }

    const seenChapterIds = new Set<string>()
    let totalPages = 0
    const chapters = parsed.chapters.map((chapter, index) => {
        if (!isRecord(chapter)) {
            throw new RequestValidationError(`chapters[${index}] is invalid`)
        }
        const id = parseId(chapter.id, `chapters[${index}].id`)
        if (seenChapterIds.has(id)) {
            throw new RequestValidationError('Duplicate chapter id')
        }
        seenChapterIds.add(id)
        const chapterTitle = parseTitle(
            chapter.title,
            `chapters[${index}].title`,
        )
        if (
            typeof chapter.pages !== 'number' ||
            !Number.isSafeInteger(chapter.pages) ||
            chapter.pages < 1
        ) {
            throw new RequestValidationError(
                `chapters[${index}].pages is invalid`,
            )
        }
        totalPages += chapter.pages
        if (totalPages > MAX_TOTAL_PAGES) {
            throw new RequestValidationError('Total page count is too large')
        }
        return { id, title: chapterTitle, pages: chapter.pages }
    })

    return { workId, title, chapters }
}

export function expectedImageKeys(
    request: CompleteUploadRequest,
): readonly string[] {
    return request.chapters.flatMap((chapter) =>
        Array.from({ length: chapter.pages }, (_, index) => {
            // FrontendとPresign APIと同じく、最低3桁の連番をServer側で再構築する。
            const fileName = `${String(index + 1).padStart(3, '0')}.webp`
            return `manga/${request.workId}/${chapter.id}/${fileName}`
        }),
    )
}

export function createMetadata(
    request: CompleteUploadRequest,
    updatedAt: string,
): MangaMetadata {
    return {
        id: request.workId,
        title: request.title,
        chapters: request.chapters,
        updatedAt,
    }
}

export function updateIndex(
    current: MangaIndex,
    metadata: MangaMetadata,
): MangaIndex {
    const entry: MangaIndexEntry = {
        id: metadata.id,
        title: metadata.title,
        chapterCount: metadata.chapters.length,
        updatedAt: metadata.updatedAt,
    }
    // 同一workIdは置換し、再送しても重複しないidempotentな更新にする。
    const works = current.works.filter((work) => work.id !== metadata.id)
    works.push(entry)
    works.sort((left, right) => left.id.localeCompare(right.id, 'en'))
    return { works }
}

export function removeFromIndex(
    current: MangaIndex,
    workId: string,
): MangaIndex {
    return { works: current.works.filter((work) => work.id !== workId) }
}

export function parseMangaIndex(body: string): MangaIndex {
    try {
        const parsed: unknown = JSON.parse(body)
        if (!isRecord(parsed) || !Array.isArray(parsed.works)) {
            throw new Error('Existing manga index has an invalid shape')
        }
        const seenIds = new Set<string>()
        const works = parsed.works.map((work) => {
            if (
                !isRecord(work) ||
                typeof work.id !== 'string' ||
                !SAFE_ID.test(work.id) ||
                typeof work.title !== 'string' ||
                typeof work.chapterCount !== 'number' ||
                !Number.isSafeInteger(work.chapterCount) ||
                work.chapterCount < 1 ||
                typeof work.updatedAt !== 'string' ||
                seenIds.has(work.id)
            ) {
                throw new Error('Existing manga index contains an invalid work')
            }
            seenIds.add(work.id)
            return {
                id: work.id,
                title: work.title,
                chapterCount: work.chapterCount,
                updatedAt: work.updatedAt,
            }
        })
        return { works }
    } catch {
        // 壊れたindexを空として上書きすると既存作品を失うため、内部エラーとして止める。
        throw new Error('Existing manga index is invalid JSON')
    }
}
