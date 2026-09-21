import { RequestValidationError } from './validation.js'

export const PRESIGN_BATCH_SIZE = 100
const MAX_PRESIGN_BODY_BYTES = 64 * 1024
const SAFE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const PAGE_FILE_NAME = /^\d{3,6}\.webp$/

export interface PresignFileRequest {
    readonly name: string
    readonly contentType: 'image/webp'
}

export interface PresignRequest {
    readonly workId: string
    readonly chapterId: string
    readonly files: readonly PresignFileRequest[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateId(value: unknown, fieldName: string): string {
    // slash、backslash、..、制御文字を個別に許可しない方式では漏れやすいため、
    // S3 Keyへ使用可能なASCII文字だけをallow-listで受け付ける。
    if (typeof value !== 'string' || !SAFE_ID.test(value)) {
        throw new RequestValidationError(`${fieldName} is invalid`)
    }
    return value
}

export function buildMangaImageKey(
    workId: string,
    chapterId: string,
    fileName: string,
): string {
    // Clientから完成済みkeyを受け取らず、検証済みの部品からServer側で必ず組み立てる。
    return `manga/${workId}/${chapterId}/${fileName}`
}

export function parsePresignRequest(body: string | undefined): PresignRequest {
    if (!body || Buffer.byteLength(body, 'utf8') > MAX_PRESIGN_BODY_BYTES) {
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

    const workId = validateId(parsed.workId, 'workId')
    const chapterId = validateId(parsed.chapterId, 'chapterId')
    if (
        !Array.isArray(parsed.files) ||
        parsed.files.length === 0 ||
        parsed.files.length > PRESIGN_BATCH_SIZE
    ) {
        throw new RequestValidationError(
            `files must contain 1-${PRESIGN_BATCH_SIZE} items`,
        )
    }

    const seenNames = new Set<string>()
    const files = parsed.files.map((file): PresignFileRequest => {
        if (
            !isRecord(file) ||
            typeof file.name !== 'string' ||
            !PAGE_FILE_NAME.test(file.name) ||
            file.contentType !== 'image/webp'
        ) {
            throw new RequestValidationError('Upload file is invalid')
        }
        if (seenNames.has(file.name)) {
            throw new RequestValidationError('Duplicate file name')
        }
        seenNames.add(file.name)
        return { name: file.name, contentType: 'image/webp' }
    })

    return { workId, chapterId, files }
}
