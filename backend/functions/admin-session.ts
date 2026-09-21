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
import { loadAdminRuntimeConfig } from '../shared/config.js'
import {
    CachedSsmParameterReader,
    type ParameterReader,
} from '../shared/parameters.js'
import { errorResponse, jsonResponse } from '../shared/responses.js'

export interface AdminSessionDependencies {
    readonly signingKeyParameterName: string
    readonly parameters: ParameterReader
    readonly now: () => number
}

// HttpOnly CookieはFrontendから読めないため、このAPIでサーバー側の署名・期限を確認する。
// 同じ検証関数はPhase 4のPresign APIでも再利用する。
export function createAdminSessionHandler(
    dependencies: AdminSessionDependencies,
) {
    return async (
        event: APIGatewayProxyEventV2,
    ): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            const signingKey = await dependencies.parameters.getSecureString(
                dependencies.signingKeyParameterName,
            )
            const cookie = readCookie(event.cookies, ADMIN_COOKIE_NAME)
            if (
                !verifyAdminSession(
                    cookie,
                    signingKey,
                    Math.floor(dependencies.now() / 1000),
                )
            ) {
                return errorResponse(401, 'ADMIN_AUTH_REQUIRED', 'Unauthorized')
            }
            return jsonResponse(200, { ok: true })
        } catch {
            console.error(
                'Admin session check failed because of an internal error',
            )
            return errorResponse(500, 'INTERNAL_ERROR', 'Session check failed')
        }
    }
}

let runtimeHandler: ReturnType<typeof createAdminSessionHandler> | undefined

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    runtimeHandler ??= createAdminSessionHandler({
        signingKeyParameterName:
            loadAdminRuntimeConfig().adminSigningKeyParameterName,
        parameters: new CachedSsmParameterReader(),
        now: Date.now,
    })
    return runtimeHandler(event)
}
