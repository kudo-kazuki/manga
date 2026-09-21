import {
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3'
import type {
    APIGatewayProxyEventV2,
    APIGatewayProxyHandlerV2,
    APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'
import {
    ADMIN_COOKIE_NAME,
    readCookie,
    verifyAdminSession,
} from '../shared/admin-session.js'
import {
    createMetadata,
    expectedImageKeys,
    parseCompleteUploadRequest,
    parseMangaIndex,
    updateIndex,
    type MangaIndex,
    type MangaMetadata,
} from '../shared/metadata.js'
import {
    CachedSsmParameterReader,
    type ParameterReader,
} from '../shared/parameters.js'
import { errorResponse, jsonResponse } from '../shared/responses.js'
import { RequestValidationError } from '../shared/validation.js'

const METADATA_CACHE_CONTROL = 'public, max-age=60, s-maxage=60'
const INDEX_UPDATE_ATTEMPTS = 4

export interface StoredIndex {
    readonly body: string
    readonly eTag: string
}

export interface CompleteUploadStorage {
    listObjects(prefix: string): Promise<ReadonlyMap<string, number>>
    writeMetadata(key: string, metadata: MangaMetadata): Promise<void>
    readIndex(): Promise<StoredIndex | undefined>
    writeIndex(
        index: MangaIndex,
        expectedETag: string | undefined,
    ): Promise<void>
}

export class IndexWriteConflictError extends Error {
    public override readonly name = 'IndexWriteConflictError'
}

export interface CompleteUploadDependencies {
    readonly adminSigningKeyParameterName: string
    readonly parameters: ParameterReader
    readonly storage: CompleteUploadStorage
    readonly now: () => Date
}

async function verifyAllImages(
    storage: CompleteUploadStorage,
    workId: string,
    expectedKeys: readonly string[],
): Promise<boolean> {
    // HeadObjectを画像数分発行せず、作品prefixをpagination付きListで一度走査する。
    const uploaded = await storage.listObjects(`manga/${workId}/`)
    return expectedKeys.every((key) => (uploaded.get(key) ?? 0) > 0)
}

async function updatePublishedIndex(
    storage: CompleteUploadStorage,
    metadata: MangaMetadata,
): Promise<void> {
    for (let attempt = 0; attempt < INDEX_UPDATE_ATTEMPTS; attempt += 1) {
        const stored = await storage.readIndex()
        const current = stored ? parseMangaIndex(stored.body) : { works: [] }
        try {
            // ETag条件付きPUTにより、別作品の同時完了で片方を消すlost updateを防ぐ。
            await storage.writeIndex(
                updateIndex(current, metadata),
                stored?.eTag,
            )
            return
        } catch (error) {
            if (!(error instanceof IndexWriteConflictError)) throw error
        }
    }
    throw new Error('Manga index update conflicted repeatedly')
}

export function createCompleteUploadHandler(
    dependencies: CompleteUploadDependencies,
) {
    return async (
        event: APIGatewayProxyEventV2,
    ): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            const adminCookie = readCookie(event.cookies, ADMIN_COOKIE_NAME)
            if (!adminCookie) {
                return errorResponse(401, 'ADMIN_AUTH_REQUIRED', 'Unauthorized')
            }
            const signingKey = await dependencies.parameters.getSecureString(
                dependencies.adminSigningKeyParameterName,
            )
            if (
                !verifyAdminSession(
                    adminCookie,
                    signingKey,
                    Math.floor(dependencies.now().getTime() / 1000),
                )
            ) {
                return errorResponse(401, 'ADMIN_AUTH_REQUIRED', 'Unauthorized')
            }

            const request = parseCompleteUploadRequest(event.body)
            const expectedKeys = expectedImageKeys(request)
            if (
                !(await verifyAllImages(
                    dependencies.storage,
                    request.workId,
                    expectedKeys,
                ))
            ) {
                // 不足Key自体はresponseへ出さず、Clientには再確認可能な固定codeだけを返す。
                return errorResponse(
                    409,
                    'UPLOAD_INCOMPLETE',
                    'Uploaded images are incomplete',
                )
            }

            const metadata = createMetadata(
                request,
                dependencies.now().toISOString(),
            )
            await dependencies.storage.writeMetadata(
                `manga/${request.workId}/metadata.json`,
                metadata,
            )
            // metadataを書けた作品だけを一覧へ載せる。index更新失敗時は安全に再送できる。
            await updatePublishedIndex(dependencies.storage, metadata)
            return jsonResponse(200, {
                ok: true,
                work: {
                    id: metadata.id,
                    title: metadata.title,
                    chapterCount: metadata.chapters.length,
                },
            })
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return errorResponse(400, 'INVALID_REQUEST', error.message)
            }
            console.error(
                'Upload completion failed because of an internal error',
            )
            return errorResponse(
                500,
                'INTERNAL_ERROR',
                'Upload completion failed',
            )
        }
    }
}

function requiredEnvironment(name: string): string {
    const value = process.env[name]
    if (!value)
        throw new Error(`Missing required environment variable: ${name}`)
    return value
}

function isPreconditionFailure(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false
    const metadata = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata
    return metadata?.httpStatusCode === 412
}

function isNotFound(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false
    const metadata = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata
    return metadata?.httpStatusCode === 404
}

let runtimeHandler: ReturnType<typeof createCompleteUploadHandler> | undefined
const s3Client = new S3Client({})

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    const bucketName = requiredEnvironment('MANGA_BUCKET_NAME')
    runtimeHandler ??= createCompleteUploadHandler({
        adminSigningKeyParameterName: requiredEnvironment(
            'ADMIN_SIGNING_KEY_PARAMETER_NAME',
        ),
        parameters: new CachedSsmParameterReader(),
        storage: {
            async listObjects(prefix) {
                const objects = new Map<string, number>()
                let continuationToken: string | undefined
                do {
                    const response = await s3Client.send(
                        new ListObjectsV2Command({
                            Bucket: bucketName,
                            Prefix: prefix,
                            ContinuationToken: continuationToken,
                        }),
                    )
                    for (const object of response.Contents ?? []) {
                        if (object.Key)
                            objects.set(object.Key, object.Size ?? 0)
                    }
                    continuationToken = response.NextContinuationToken
                } while (continuationToken)
                return objects
            },
            async writeMetadata(key, metadata) {
                await s3Client.send(
                    new PutObjectCommand({
                        Bucket: bucketName,
                        Key: key,
                        Body: JSON.stringify(metadata),
                        ContentType: 'application/json; charset=utf-8',
                        CacheControl: METADATA_CACHE_CONTROL,
                    }),
                )
            },
            async readIndex() {
                try {
                    const response = await s3Client.send(
                        new GetObjectCommand({
                            Bucket: bucketName,
                            Key: 'manga/index.json',
                        }),
                    )
                    if (!response.Body || !response.ETag) {
                        throw new Error('Manga index response is incomplete')
                    }
                    return {
                        body: await response.Body.transformToString('utf-8'),
                        eTag: response.ETag,
                    }
                } catch (error) {
                    if (isNotFound(error)) return undefined
                    throw error
                }
            },
            async writeIndex(index, expectedETag) {
                try {
                    await s3Client.send(
                        new PutObjectCommand({
                            Bucket: bucketName,
                            Key: 'manga/index.json',
                            Body: JSON.stringify(index),
                            ContentType: 'application/json; charset=utf-8',
                            CacheControl: METADATA_CACHE_CONTROL,
                            // 初回作成も同時実行を考慮し、既存objectがない場合だけ成功させる。
                            ...(expectedETag
                                ? { IfMatch: expectedETag }
                                : { IfNoneMatch: '*' }),
                        }),
                    )
                } catch (error) {
                    if (isPreconditionFailure(error)) {
                        throw new IndexWriteConflictError()
                    }
                    throw error
                }
            },
        },
        now: () => new Date(),
    })
    return runtimeHandler(event)
}
