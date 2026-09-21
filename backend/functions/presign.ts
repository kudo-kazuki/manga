import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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
    CachedSsmParameterReader,
    type ParameterReader,
} from '../shared/parameters.js'
import { errorResponse, jsonResponse } from '../shared/responses.js'
import { buildMangaImageKey, parsePresignRequest } from '../shared/upload.js'
import { RequestValidationError } from '../shared/validation.js'

export interface PutUrlInput {
    readonly bucketName: string
    readonly key: string
    readonly contentType: 'image/webp'
    readonly expiresInSeconds: number
}

export interface PutUrlSigner {
    createPutUrl(input: PutUrlInput): Promise<string>
}

export interface PresignDependencies {
    readonly bucketName: string
    readonly adminSigningKeyParameterName: string
    readonly expiresInSeconds: number
    readonly parameters: ParameterReader
    readonly signer: PutUrlSigner
    readonly now: () => number
}

export function createPresignHandler(dependencies: PresignDependencies) {
    return async (
        event: APIGatewayProxyEventV2,
    ): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            // CookieがないrequestではSSMすら呼ばず、早い段階で拒否する。
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
                    Math.floor(dependencies.now() / 1000),
                )
            ) {
                return errorResponse(401, 'ADMIN_AUTH_REQUIRED', 'Unauthorized')
            }

            const request = parsePresignRequest(event.body)
            const files = await Promise.all(
                request.files.map(async (file) => {
                    const key = buildMangaImageKey(
                        request.workId,
                        request.chapterId,
                        file.name,
                    )
                    return {
                        key,
                        uploadUrl: await dependencies.signer.createPutUrl({
                            bucketName: dependencies.bucketName,
                            key,
                            contentType: file.contentType,
                            expiresInSeconds: dependencies.expiresInSeconds,
                        }),
                    }
                }),
            )

            // Presigned URLは秘密に近い一時credentialなので、ログへ出さない。
            return jsonResponse(200, { ok: true, files })
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return errorResponse(400, 'INVALID_REQUEST', error.message)
            }
            console.error('Presign failed because of an internal error')
            return errorResponse(500, 'INTERNAL_ERROR', 'Presign failed')
        }
    }
}

function requiredEnvironment(name: string): string {
    const value = process.env[name]
    if (!value)
        throw new Error(`Missing required environment variable: ${name}`)
    return value
}

let runtimeHandler: ReturnType<typeof createPresignHandler> | undefined
// 1 requestで最大100 URLを作るため、SDK clientはURLごとに生成せずLambda container内で共有する。
const s3Client = new S3Client({})

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    runtimeHandler ??= createPresignHandler({
        bucketName: requiredEnvironment('MANGA_BUCKET_NAME'),
        adminSigningKeyParameterName: requiredEnvironment(
            'ADMIN_SIGNING_KEY_PARAMETER_NAME',
        ),
        expiresInSeconds: Number(process.env.PRESIGNED_URL_TTL_SECONDS ?? 900),
        parameters: new CachedSsmParameterReader(),
        signer: {
            async createPutUrl(input) {
                // ContentTypeも署名条件へ含め、FrontendのPUT headerと一致させる。
                return getSignedUrl(
                    s3Client,
                    new PutObjectCommand({
                        Bucket: input.bucketName,
                        Key: input.key,
                        ContentType: input.contentType,
                        CacheControl: 'public, max-age=31536000, immutable',
                    }),
                    { expiresIn: input.expiresInSeconds },
                )
            },
        },
        now: Date.now,
    })
    return runtimeHandler(event)
}
