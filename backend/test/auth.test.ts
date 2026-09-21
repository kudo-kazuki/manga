import { generateKeyPairSync, randomBytes, scryptSync } from 'node:crypto'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { describe, expect, it } from 'vitest'
import { createAdminLoginHandler } from '../functions/admin-login.js'
import { handler as adminLogoutHandler } from '../functions/admin-logout.js'
import { createAdminSessionHandler } from '../functions/admin-session.js'
import { createLoginHandler } from '../functions/login.js'
import { handler as logoutHandler } from '../functions/logout.js'
import {
    ADMIN_COOKIE_NAME,
    readCookie,
    verifyAdminSession,
} from '../shared/admin-session.js'
import type { AdminRuntimeConfig, RuntimeConfig } from '../shared/config.js'
import type { ParameterReader } from '../shared/parameters.js'

const password = 'correct horse battery staple'
const salt = randomBytes(16)
const passwordHash = `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 64).toString('base64')}`
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString()

const config: RuntimeConfig = {
    viewerPasswordParameterName: '/manga/viewer-password-hash',
    cloudFrontPrivateKeyParameterName: '/manga/cloudfront-private-key',
    cloudFrontKeyPairId: 'KTESTKEYPAIR',
    signedCookieTtlSeconds: 3600,
}

const parameters: ParameterReader = {
    async getSecureString(name) {
        if (name === config.viewerPasswordParameterName) return passwordHash
        if (name === config.cloudFrontPrivateKeyParameterName) return privateKey
        throw new Error('Unexpected parameter')
    },
}

function event(
    body: unknown,
    viewerHost = 'd111111abcdef8.cloudfront.net',
): APIGatewayProxyEventV2 {
    return {
        version: '2.0',
        routeKey: 'POST /api/login',
        rawPath: '/api/login',
        rawQueryString: '',
        headers: {
            'content-type': 'application/json',
            'x-manga-viewer-host': viewerHost,
        },
        requestContext: {} as APIGatewayProxyEventV2['requestContext'],
        isBase64Encoded: false,
        body: typeof body === 'string' ? body : JSON.stringify(body),
    } satisfies APIGatewayProxyEventV2
}

describe('viewer authentication', () => {
    const login = createLoginHandler({
        config,
        parameters,
        now: () => 1_800_000_000_000,
    })

    it('正しいpasswordで/manga/*だけのSigned Cookieを3個返す', async () => {
        const response = await login(event({ password }))

        expect(response.statusCode).toBe(200)
        expect(response.cookies).toHaveLength(3)
        expect(response.cookies).toEqual(
            expect.arrayContaining([
                expect.stringContaining('CloudFront-Policy='),
                expect.stringContaining('CloudFront-Signature='),
                expect.stringContaining('CloudFront-Key-Pair-Id=KTESTKEYPAIR'),
            ]),
        )

        const policyCookie = response.cookies?.find((cookie) =>
            cookie.startsWith('CloudFront-Policy='),
        )
        const encodedPolicy = policyCookie?.split(';')[0]?.split('=')[1]
        const policy = Buffer.from(
            (encodedPolicy ?? '')
                .replaceAll('-', '+')
                .replaceAll('_', '=')
                .replaceAll('~', '/'),
            'base64',
        ).toString('utf8')

        expect(policy).toContain(
            'https://d111111abcdef8.cloudfront.net/manga/*',
        )
        expect(policy).toContain('1800003600')
        expect(
            response.cookies?.every((cookie) => cookie.includes('HttpOnly')),
        ).toBe(true)
    })

    it('誤ったpasswordを詳細なしの401にする', async () => {
        const response = await login(event({ password: 'wrong' }))
        expect(response.statusCode).toBe(401)
        expect(response.cookies).toBeUndefined()
        expect(response.body).not.toContain(password)
    })

    it('不正JSON、空password、不正viewer hostを400にする', async () => {
        await expect(login(event('{'))).resolves.toMatchObject({
            statusCode: 400,
        })
        await expect(login(event({ password: '' }))).resolves.toMatchObject({
            statusCode: 400,
        })
        await expect(
            login(event({ password }, 'https://evil.example/path')),
        ).resolves.toMatchObject({ statusCode: 400 })
    })

    it('logoutはCookieがなくても3個を期限切れにする', async () => {
        const response = await logoutHandler(
            event(undefined),
            {} as never,
            () => {},
        )
        expect(response).toMatchObject({ statusCode: 200 })
        if (typeof response === 'string' || response === undefined) {
            throw new Error('Unexpected Lambda response')
        }
        expect(response.cookies).toHaveLength(3)
        expect(
            response.cookies?.every(
                (cookie) =>
                    cookie.includes('Max-Age=0') && cookie.includes('HttpOnly'),
            ),
        ).toBe(true)
    })
})

describe('admin authentication', () => {
    const adminConfig: AdminRuntimeConfig = {
        adminPasswordParameterName: '/manga/admin-password-hash',
        adminSigningKeyParameterName: '/manga/admin-signing-key',
        adminSessionTtlSeconds: 1800,
    }
    const signingKey = 'test-signing-key-with-enough-randomness'
    const adminParameters: ParameterReader = {
        async getSecureString(name) {
            if (name === adminConfig.adminPasswordParameterName)
                return passwordHash
            if (name === adminConfig.adminSigningKeyParameterName)
                return signingKey
            throw new Error('Unexpected parameter')
        },
    }
    const adminLogin = createAdminLoginHandler({
        config: adminConfig,
        parameters: adminParameters,
        now: () => 1_800_000_000_000,
    })

    it('正しい管理passwordで検証可能な管理Cookieを返す', async () => {
        const response = await adminLogin(event({ password }))
        expect(response.statusCode).toBe(200)
        expect(response.cookies).toHaveLength(1)

        const cookieHeader = response.cookies?.[0]
        const cookieValue = readCookie(
            cookieHeader ? [cookieHeader] : [],
            ADMIN_COOKIE_NAME,
        )
        expect(verifyAdminSession(cookieValue, signingKey, 1_800_000_100)).toBe(
            true,
        )
    })

    it('改ざん、期限切れ、異なる署名鍵を拒否する', async () => {
        const response = await adminLogin(event({ password }))
        const cookieValue = readCookie(response.cookies, ADMIN_COOKIE_NAME)
        expect(
            verifyAdminSession(`${cookieValue}x`, signingKey, 1_800_000_100),
        ).toBe(false)
        expect(
            verifyAdminSession(cookieValue, 'different-key', 1_800_000_100),
        ).toBe(false)
        expect(verifyAdminSession(cookieValue, signingKey, 1_800_002_000)).toBe(
            false,
        )
    })

    it('session確認APIが有効Cookieだけを許可する', async () => {
        const loginResponse = await adminLogin(event({ password }))
        const session = createAdminSessionHandler({
            signingKeyParameterName: adminConfig.adminSigningKeyParameterName,
            parameters: adminParameters,
            now: () => 1_800_000_100_000,
        })
        const validEvent = event(undefined)
        validEvent.cookies = loginResponse.cookies
        await expect(session(validEvent)).resolves.toMatchObject({
            statusCode: 200,
        })

        const invalidEvent = event(undefined)
        invalidEvent.cookies = [`${ADMIN_COOKIE_NAME}=tampered.value`]
        await expect(session(invalidEvent)).resolves.toMatchObject({
            statusCode: 401,
        })
    })

    it('閲覧passwordとは別の管理password導出値で検証する', async () => {
        const otherSalt = randomBytes(16)
        const onlyAdminPassword = 'admin-only-password'
        const isolatedParameters: ParameterReader = {
            async getSecureString(name) {
                if (name === adminConfig.adminPasswordParameterName) {
                    return `scrypt$${otherSalt.toString('base64')}$${scryptSync(onlyAdminPassword, otherSalt, 64).toString('base64')}`
                }
                return signingKey
            },
        }
        const isolatedLogin = createAdminLoginHandler({
            config: adminConfig,
            parameters: isolatedParameters,
            now: () => 1_800_000_000_000,
        })

        await expect(isolatedLogin(event({ password }))).resolves.toMatchObject(
            { statusCode: 401 },
        )
        await expect(
            isolatedLogin(event({ password: onlyAdminPassword })),
        ).resolves.toMatchObject({ statusCode: 200 })
    })

    it('admin logoutは管理Cookieを期限切れにする', async () => {
        const response = await adminLogoutHandler(
            event(undefined),
            {} as never,
            () => {},
        )
        if (typeof response === 'string' || response === undefined) {
            throw new Error('Unexpected Lambda response')
        }
        expect(response.cookies?.[0]).toContain(`${ADMIN_COOKIE_NAME}=`)
        expect(response.cookies?.[0]).toContain('Max-Age=0')
    })
})
