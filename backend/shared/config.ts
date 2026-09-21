// CloudFrontの署名Cookieは3個で1セット。名前を各handlerへ散らさず、
// 発行時と削除時で必ず同じ一覧を使えるようにする。
export const SIGNED_COOKIE_NAMES = [
    'CloudFront-Policy',
    'CloudFront-Signature',
    'CloudFront-Key-Pair-Id',
] as const

export const DEFAULT_SIGNED_COOKIE_TTL_SECONDS = 24 * 60 * 60
export const DEFAULT_ADMIN_SESSION_TTL_SECONDS = 60 * 60
// Login APIが受け取るのは短いpasswordだけなので、巨大なJSONを早い段階で拒否する。
export const MAX_REQUEST_BODY_BYTES = 4096

export interface RuntimeConfig {
    readonly viewerPasswordParameterName: string
    readonly cloudFrontPrivateKeyParameterName: string
    readonly cloudFrontKeyPairId: string
    readonly signedCookieTtlSeconds: number
}

export interface AdminRuntimeConfig {
    readonly adminPasswordParameterName: string
    readonly adminSigningKeyParameterName: string
    readonly adminSessionTtlSeconds: number
}

function requiredEnvironment(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
}

export function loadRuntimeConfig(): RuntimeConfig {
    // 環境変数はLambda起動時にだけ読み、テストでは依存値を直接注入できる設計にしている。
    const configuredTtl = Number(
        process.env.SIGNED_COOKIE_TTL_SECONDS ??
            DEFAULT_SIGNED_COOKIE_TTL_SECONDS,
    )

    if (!Number.isSafeInteger(configuredTtl) || configuredTtl <= 0) {
        throw new Error('SIGNED_COOKIE_TTL_SECONDS must be a positive integer')
    }

    return {
        viewerPasswordParameterName: requiredEnvironment(
            'VIEWER_PASSWORD_PARAMETER_NAME',
        ),
        cloudFrontPrivateKeyParameterName: requiredEnvironment(
            'CLOUDFRONT_PRIVATE_KEY_PARAMETER_NAME',
        ),
        cloudFrontKeyPairId: requiredEnvironment('CLOUDFRONT_KEY_PAIR_ID'),
        signedCookieTtlSeconds: configuredTtl,
    }
}

export function loadAdminRuntimeConfig(): AdminRuntimeConfig {
    const configuredTtl = Number(
        process.env.ADMIN_SESSION_TTL_SECONDS ??
            DEFAULT_ADMIN_SESSION_TTL_SECONDS,
    )
    if (!Number.isSafeInteger(configuredTtl) || configuredTtl <= 0) {
        throw new Error('ADMIN_SESSION_TTL_SECONDS must be a positive integer')
    }

    return {
        adminPasswordParameterName: requiredEnvironment(
            'ADMIN_PASSWORD_PARAMETER_NAME',
        ),
        adminSigningKeyParameterName: requiredEnvironment(
            'ADMIN_SIGNING_KEY_PARAMETER_NAME',
        ),
        adminSessionTtlSeconds: configuredTtl,
    }
}
