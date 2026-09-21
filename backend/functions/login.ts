import type {
    APIGatewayProxyEventV2,
    APIGatewayProxyHandlerV2,
    APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'
import { createSignedCookies } from '../shared/cloudfront-cookies.js'
import { loadRuntimeConfig, type RuntimeConfig } from '../shared/config.js'
import {
    CachedSsmParameterReader,
    type ParameterReader,
} from '../shared/parameters.js'
import { verifyScryptPassword } from '../shared/password.js'
import { errorResponse, jsonResponse } from '../shared/responses.js'
import {
    parsePasswordRequest,
    parseViewerHost,
    RequestValidationError,
} from '../shared/validation.js'

export interface LoginDependencies {
    readonly config: RuntimeConfig
    readonly parameters: ParameterReader
    readonly now: () => number
}

// AWS SDKや現在時刻を注入可能にし、unit testではAWSへ接続せず認証処理を検証する。
export function createLoginHandler(dependencies: LoginDependencies) {
    return async (
        event: APIGatewayProxyEventV2,
    ): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            const password = parsePasswordRequest(event.body)
            const viewerHost = parseViewerHost(event.headers)
            // passwordの導出値と秘密鍵はFrontendやCloudFormationへ埋め込まず、実行時にSSMから読む。
            const passwordHash = await dependencies.parameters.getSecureString(
                dependencies.config.viewerPasswordParameterName,
            )

            if (!(await verifyScryptPassword(password, passwordHash))) {
                return errorResponse(
                    401,
                    'INVALID_CREDENTIALS',
                    'Password is incorrect',
                )
            }

            // 認証成功後にだけ秘密鍵を取得し、失敗リクエストでは不要なSSM参照を増やさない。
            const privateKey = await dependencies.parameters.getSecureString(
                dependencies.config.cloudFrontPrivateKeyParameterName,
            )
            const expiresAtEpochSeconds =
                Math.floor(dependencies.now() / 1000) +
                dependencies.config.signedCookieTtlSeconds
            const cookies = createSignedCookies({
                viewerHost,
                keyPairId: dependencies.config.cloudFrontKeyPairId,
                privateKey,
                expiresAtEpochSeconds,
            })

            return jsonResponse(200, { ok: true }, cookies)
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return errorResponse(400, 'INVALID_REQUEST', error.message)
            }

            // password、秘密鍵、SSM値、署名Cookieは絶対にログへ含めない。
            console.error('Login failed because of an internal error')
            return errorResponse(500, 'INTERNAL_ERROR', 'Login failed')
        }
    }
}

let runtimeHandler: ReturnType<typeof createLoginHandler> | undefined

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    // 初回呼び出し時だけAWS SDK clientと設定を作り、warm startでは再利用する。
    runtimeHandler ??= createLoginHandler({
        config: loadRuntimeConfig(),
        parameters: new CachedSsmParameterReader(),
        now: Date.now,
    })
    return runtimeHandler(event)
}
