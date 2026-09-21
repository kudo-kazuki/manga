import { describe, expect, it } from 'vitest'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { createPresignHandler } from '../functions/presign.js'
import {
    ADMIN_COOKIE_NAME,
    createAdminSessionCookie,
    readCookie,
} from '../shared/admin-session.js'
import type { ParameterReader } from '../shared/parameters.js'
import { RequestValidationError } from '../shared/validation.js'
import {
    buildMangaImageKey,
    parsePresignRequest,
    PRESIGN_BATCH_SIZE,
} from '../shared/upload.js'

function request(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        workId: 'baburios-abc123',
        chapterId: '001',
        files: [{ name: '001.webp', contentType: 'image/webp' }],
        ...overrides,
    })
}

describe('Presign request validation', () => {
    it('正常値から仕様どおりのS3 Keyを生成する', () => {
        const parsed = parsePresignRequest(request())
        expect(
            buildMangaImageKey(
                parsed.workId,
                parsed.chapterId,
                parsed.files[0]?.name ?? '',
            ),
        ).toBe('manga/baburios-abc123/001/001.webp')
    })

    it.each([
        '../secret',
        'work/chapter',
        'work\\chapter',
        '日本語ID',
        'UPPERCASE',
        '',
    ])('path traversal相当または許可外workIdを拒否する: %s', (workId) => {
        expect(() => parsePresignRequest(request({ workId }))).toThrow(
            RequestValidationError,
        )
    })

    it.each(['1.webp', '001.jpg', '../001.webp', '001.WEBP', 'page.webp'])(
        '不正なpage filenameを拒否する: %s',
        (name) => {
            expect(() =>
                parsePresignRequest(
                    request({
                        files: [{ name, contentType: 'image/webp' }],
                    }),
                ),
            ).toThrow(RequestValidationError)
        },
    )

    it('image/webp以外と重複filenameを拒否する', () => {
        expect(() =>
            parsePresignRequest(
                request({
                    files: [{ name: '001.webp', contentType: 'image/png' }],
                }),
            ),
        ).toThrow(RequestValidationError)
        expect(() =>
            parsePresignRequest(
                request({
                    files: [
                        { name: '001.webp', contentType: 'image/webp' },
                        { name: '001.webp', contentType: 'image/webp' },
                    ],
                }),
            ),
        ).toThrow('Duplicate file name')
    })

    it('100件を許可し、101件以上を拒否する', () => {
        const files = Array.from(
            { length: PRESIGN_BATCH_SIZE },
            (_, index) => ({
                name: `${String(index + 1).padStart(3, '0')}.webp`,
                contentType: 'image/webp',
            }),
        )
        expect(parsePresignRequest(request({ files })).files).toHaveLength(100)
        expect(() =>
            parsePresignRequest(
                request({
                    files: [
                        ...files,
                        { name: '101.webp', contentType: 'image/webp' },
                    ],
                }),
            ),
        ).toThrow(RequestValidationError)
    })
})

describe('Presign handler', () => {
    const signingKey = 'admin-signing-key-with-enough-randomness'
    const signingKeyParameterName = '/manga/admin-signing-key'
    const parameters: ParameterReader = {
        async getSecureString(name) {
            if (name !== signingKeyParameterName) throw new Error('unexpected')
            return signingKey
        },
    }
    const signedInputs: Array<{
        key: string
        contentType: string
        expiresInSeconds: number
    }> = []
    const handler = createPresignHandler({
        bucketName: 'private-manga-bucket',
        adminSigningKeyParameterName: signingKeyParameterName,
        expiresInSeconds: 900,
        parameters,
        signer: {
            async createPutUrl(input) {
                signedInputs.push({
                    key: input.key,
                    contentType: input.contentType,
                    expiresInSeconds: input.expiresInSeconds,
                })
                return `https://upload.example/${input.key}`
            },
        },
        now: () => 1_800_000_000_000,
    })

    function event(withCookie: boolean): APIGatewayProxyEventV2 {
        const responseCookie = createAdminSessionCookie(
            signingKey,
            1_800_001_000,
        )
        const cookieValue = readCookie([responseCookie], ADMIN_COOKIE_NAME)
        return {
            version: '2.0',
            routeKey: 'POST /api/upload/presign',
            rawPath: '/api/upload/presign',
            rawQueryString: '',
            headers: { 'content-type': 'application/json' },
            requestContext: {} as APIGatewayProxyEventV2['requestContext'],
            isBase64Encoded: false,
            body: request(),
            ...(withCookie && cookieValue
                ? { cookies: [`${ADMIN_COOKIE_NAME}=${cookieValue}`] }
                : {}),
        }
    }

    it('未認証requestを拒否してURLを発行しない', async () => {
        signedInputs.length = 0
        const response = await handler(event(false))
        expect(response.statusCode).toBe(401)
        expect(signedInputs).toHaveLength(0)
    })

    it('認証済みrequestへmanga prefixのPUT URLを返す', async () => {
        signedInputs.length = 0
        const response = await handler(event(true))
        expect(response.statusCode).toBe(200)
        expect(signedInputs).toEqual([
            {
                key: 'manga/baburios-abc123/001/001.webp',
                contentType: 'image/webp',
                expiresInSeconds: 900,
            },
        ])
        expect(response.body).toContain(
            'https://upload.example/manga/baburios-abc123/001/001.webp',
        )
    })

    it('改ざんされた管理Cookieを拒否する', async () => {
        signedInputs.length = 0
        const tamperedEvent = event(true)
        tamperedEvent.cookies = tamperedEvent.cookies?.map(
            (cookie) => `${cookie.slice(0, -1)}x`,
        )

        const response = await handler(tamperedEvent)

        expect(response.statusCode).toBe(401)
        expect(signedInputs).toHaveLength(0)
    })
})
