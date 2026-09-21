import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const ADMIN_COOKIE_NAME = 'Manga-Admin-Session'
const ADMIN_COOKIE_ATTRIBUTES = 'Path=/api; Secure; HttpOnly; SameSite=Lax'

interface AdminSessionPayload {
    readonly purpose: 'admin'
    readonly expiresAt: number
    readonly nonce: string
}

function encode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url')
}

function sign(encodedPayload: string, signingKey: string): string {
    return createHmac('sha256', signingKey)
        .update(encodedPayload)
        .digest('base64url')
}

// DBを持たずに管理者sessionを検証できるよう、短いpayloadへHMAC署名する。
// nonceは同時刻に発行したCookieも同一値にならないようにするためのもので、DB照合は行わない。
export function createAdminSessionCookie(
    signingKey: string,
    expiresAtEpochSeconds: number,
): string {
    const payload: AdminSessionPayload = {
        purpose: 'admin',
        expiresAt: expiresAtEpochSeconds,
        nonce: randomBytes(16).toString('base64url'),
    }
    const encodedPayload = encode(JSON.stringify(payload))
    return `${ADMIN_COOKIE_NAME}=${encodedPayload}.${sign(encodedPayload, signingKey)}; ${ADMIN_COOKIE_ATTRIBUTES}`
}

export function createExpiredAdminSessionCookie(): string {
    return `${ADMIN_COOKIE_NAME}=; ${ADMIN_COOKIE_ATTRIBUTES}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export function readCookie(
    cookieHeaders: readonly string[] | undefined,
    name: string,
): string | undefined {
    // API Gateway payload v2ではevent.cookiesが利用できる。複数headerにも対応できるよう全要素を走査する。
    for (const header of cookieHeaders ?? []) {
        for (const part of header.split(';')) {
            const separator = part.indexOf('=')
            if (separator < 0) continue
            if (part.slice(0, separator).trim() === name) {
                return part.slice(separator + 1).trim()
            }
        }
    }
    return undefined
}

export function verifyAdminSession(
    cookieValue: string | undefined,
    signingKey: string,
    nowEpochSeconds: number,
): boolean {
    if (!cookieValue) return false
    const [encodedPayload, suppliedSignature, extra] = cookieValue.split('.')
    if (!encodedPayload || !suppliedSignature || extra !== undefined)
        return false

    const expectedSignature = sign(encodedPayload, signingKey)
    const supplied = Buffer.from(suppliedSignature)
    const expected = Buffer.from(expectedSignature)
    if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
    ) {
        return false
    }

    try {
        const payload = JSON.parse(
            Buffer.from(encodedPayload, 'base64url').toString('utf8'),
        ) as Partial<AdminSessionPayload>
        return (
            payload.purpose === 'admin' &&
            typeof payload.expiresAt === 'number' &&
            Number.isSafeInteger(payload.expiresAt) &&
            payload.expiresAt > nowEpochSeconds &&
            typeof payload.nonce === 'string' &&
            payload.nonce.length >= 16
        )
    } catch {
        return false
    }
}
