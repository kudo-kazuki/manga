import { createSign } from 'node:crypto'
import { SIGNED_COOKIE_NAMES } from './config.js'

function cloudFrontBase64(value: Buffer | string): string {
    // CloudFrontは通常のBase64ではなく、+/=を-~_へ置換した形式を要求する。
    return Buffer.from(value)
        .toString('base64')
        .replaceAll('+', '-')
        .replaceAll('=', '_')
        .replaceAll('/', '~')
}

export interface SignedCookieInput {
    readonly viewerHost: string
    readonly keyPairId: string
    readonly privateKey: string
    readonly expiresAtEpochSeconds: number
}

export function createSignedCookies(input: SignedCookieInput): string[] {
    // サイト全体ではなく漫画データだけを許可するCustom Policyにする。
    // ログイン画面やSPA本体はCookieがなくてもCloudFrontから取得できる。
    const policy = JSON.stringify({
        Statement: [
            {
                Resource: `https://${input.viewerHost}/manga/*`,
                Condition: {
                    DateLessThan: {
                        'AWS:EpochTime': input.expiresAtEpochSeconds,
                    },
                },
            },
        ],
    })
    // CloudFront signed cookieの署名仕様に合わせてRSA-SHA1を使用する。
    const signer = createSign('RSA-SHA1')
    signer.update(policy)
    signer.end()

    // JavaScriptからCookie値を読ませず、HTTPSかつ同一サイト用途に限定する。
    // Domainを付けないため、実際にログインしたhostだけで有効なhost-only Cookieになる。
    const attributes = `Path=/; Secure; HttpOnly; SameSite=Lax; Expires=${new Date(input.expiresAtEpochSeconds * 1000).toUTCString()}`
    return [
        `${SIGNED_COOKIE_NAMES[0]}=${cloudFrontBase64(policy)}; ${attributes}`,
        `${SIGNED_COOKIE_NAMES[1]}=${cloudFrontBase64(signer.sign(input.privateKey))}; ${attributes}`,
        `${SIGNED_COOKIE_NAMES[2]}=${input.keyPairId}; ${attributes}`,
    ]
}

export function createExpiredSignedCookies(): string[] {
    // 発行時と同じPath・属性で3個すべてを期限切れにする。
    const attributes =
        'Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    return SIGNED_COOKIE_NAMES.map((name) => `${name}=; ${attributes}`)
}
