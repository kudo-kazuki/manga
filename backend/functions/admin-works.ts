import {
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3'
import {
    CloudFrontClient,
    CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront'
import { randomUUID } from 'node:crypto'
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
    parseMangaIndex,
    parseWorkId,
    removeFromIndex,
    type MangaIndex,
} from '../shared/metadata.js'
import {
    CachedSsmParameterReader,
    type ParameterReader,
} from '../shared/parameters.js'
import { errorResponse, jsonResponse } from '../shared/responses.js'
import { RequestValidationError } from '../shared/validation.js'

const INDEX_KEY = 'manga/index.json'
const INDEX_CACHE_CONTROL = 'public, max-age=60, s-maxage=60'
const INDEX_UPDATE_ATTEMPTS = 4
const DELETE_BATCH_SIZE = 1_000

export interface StoredIndex {
    readonly body: string
    readonly eTag: string
}

export interface AdminWorksStorage {
    readIndex(): Promise<StoredIndex | undefined>
    listObjectKeys(prefix: string): Promise<readonly string[]>
    deleteObjects(keys: readonly string[]): Promise<void>
    writeIndex(index: MangaIndex, expectedETag: string): Promise<void>
}

export class IndexWriteConflictError extends Error {
    public override readonly name = 'IndexWriteConflictError'
}

export interface AdminWorksDependencies {
    readonly adminSigningKeyParameterName: string
    readonly parameters: ParameterReader
    readonly storage: AdminWorksStorage
    readonly invalidateCache: (workId: string) => Promise<void>
    readonly now: () => number
}

async function authenticate(
    event: APIGatewayProxyEventV2,
    dependencies: AdminWorksDependencies,
): Promise<boolean> {
    const cookie = readCookie(event.cookies, ADMIN_COOKIE_NAME)
    if (!cookie) return false
    const signingKey = await dependencies.parameters.getSecureString(
        dependencies.adminSigningKeyParameterName,
    )
    return verifyAdminSession(
        cookie,
        signingKey,
        Math.floor(dependencies.now() / 1000),
    )
}

async function readIndex(
    storage: AdminWorksStorage,
): Promise<{ index: MangaIndex; eTag?: string }> {
    const stored = await storage.readIndex()
    return stored
        ? { index: parseMangaIndex(stored.body), eTag: stored.eTag }
        : { index: { works: [] } }
}

async function removePublishedWork(
    storage: AdminWorksStorage,
    workId: string,
): Promise<void> {
    for (let attempt = 0; attempt < INDEX_UPDATE_ATTEMPTS; attempt += 1) {
        const { index, eTag } = await readIndex(storage)
        if (!index.works.some((work) => work.id === workId)) return
        if (!eTag) throw new Error('Manga index ETag is missing')
        try {
            await storage.writeIndex(removeFromIndex(index, workId), eTag)
            return
        } catch (error) {
            if (!(error instanceof IndexWriteConflictError)) throw error
        }
    }
    throw new Error('Manga index update conflicted repeatedly')
}

async function deleteWork(
    dependencies: AdminWorksDependencies,
    workId: string,
): Promise<void> {
    // 画像とmetadataを先に消し、index更新に失敗した場合は同じ操作を安全に再試行できるようにする。
    // DeleteObjectsは1request最大1,000件なので、大作品も小分けで処理する。
    const keys = await dependencies.storage.listObjectKeys(`manga/${workId}/`)
    for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
        await dependencies.storage.deleteObjects(
            keys.slice(start, start + DELETE_BATCH_SIZE),
        )
    }
    await removePublishedWork(dependencies.storage, workId)
    // 長期cache済み画像もinvalidation反映後は見えなくする。失敗時は同じDELETEを再送すれば再試行できる。
    await dependencies.invalidateCache(workId)
}

export function createAdminWorksHandler(dependencies: AdminWorksDependencies) {
    return async (
        event: APIGatewayProxyEventV2,
    ): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            if (!(await authenticate(event, dependencies))) {
                return errorResponse(401, 'ADMIN_AUTH_REQUIRED', 'Unauthorized')
            }

            const method = event.requestContext.http.method
            if (method === 'GET') {
                const { index } = await readIndex(dependencies.storage)
                return jsonResponse(200, { ok: true, works: index.works })
            }
            if (method === 'DELETE') {
                const workId = parseWorkId(event.pathParameters?.workId)
                await deleteWork(dependencies, workId)
                return jsonResponse(200, { ok: true })
            }
            return errorResponse(
                405,
                'METHOD_NOT_ALLOWED',
                'Method not allowed',
            )
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return errorResponse(400, 'INVALID_REQUEST', error.message)
            }
            // S3 keyやCookieなどの機密値はlogへ含めず、固定messageだけを残す。
            console.error(
                'Admin works operation failed because of an internal error',
            )
            return errorResponse(
                500,
                'INTERNAL_ERROR',
                'Admin works operation failed',
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
    return (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 412
    )
}

function isNotFound(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false
    return (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode === 404
    )
}

let runtimeHandler: ReturnType<typeof createAdminWorksHandler> | undefined
const s3Client = new S3Client({})
const cloudFrontClient = new CloudFrontClient({})

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    const bucketName = requiredEnvironment('MANGA_BUCKET_NAME')
    runtimeHandler ??= createAdminWorksHandler({
        adminSigningKeyParameterName: requiredEnvironment(
            'ADMIN_SIGNING_KEY_PARAMETER_NAME',
        ),
        parameters: new CachedSsmParameterReader(),
        storage: {
            async readIndex() {
                try {
                    const response = await s3Client.send(
                        new GetObjectCommand({
                            Bucket: bucketName,
                            Key: INDEX_KEY,
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
            async listObjectKeys(prefix) {
                const keys: string[] = []
                let continuationToken: string | undefined
                do {
                    const response = await s3Client.send(
                        new ListObjectsV2Command({
                            Bucket: bucketName,
                            Prefix: prefix,
                            ContinuationToken: continuationToken,
                        }),
                    )
                    keys.push(
                        ...(response.Contents ?? []).flatMap((object) =>
                            object.Key ? [object.Key] : [],
                        ),
                    )
                    continuationToken = response.NextContinuationToken
                } while (continuationToken)
                return keys
            },
            async deleteObjects(keys) {
                if (keys.length === 0) return
                const response = await s3Client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucketName,
                        Delete: {
                            Objects: keys.map((Key) => ({ Key })),
                            Quiet: true,
                        },
                    }),
                )
                if ((response.Errors?.length ?? 0) > 0) {
                    throw new Error('S3 reported object deletion errors')
                }
            },
            async writeIndex(index, expectedETag) {
                try {
                    await s3Client.send(
                        new PutObjectCommand({
                            Bucket: bucketName,
                            Key: INDEX_KEY,
                            Body: JSON.stringify(index),
                            ContentType: 'application/json; charset=utf-8',
                            CacheControl: INDEX_CACHE_CONTROL,
                            IfMatch: expectedETag,
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
        async invalidateCache(workId) {
            await cloudFrontClient.send(
                new CreateInvalidationCommand({
                    DistributionId: requiredEnvironment(
                        'CLOUDFRONT_DISTRIBUTION_ID',
                    ),
                    InvalidationBatch: {
                        CallerReference: `${Date.now()}-${randomUUID()}`,
                        Paths: {
                            Quantity: 2,
                            Items: ['/manga/index.json', `/manga/${workId}/*`],
                        },
                    },
                }),
            )
        },
        now: Date.now,
    })
    return runtimeHandler(event)
}
