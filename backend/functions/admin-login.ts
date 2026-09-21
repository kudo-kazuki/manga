import type {
    APIGatewayProxyEventV2,
    APIGatewayProxyHandlerV2,
    APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'
import { createAdminSessionCookie } from '../shared/admin-session.js'
import {
    loadAdminRuntimeConfig,
    type AdminRuntimeConfig,
} from '../shared/config.js'
import {
    CachedSsmParameterReader,
    type ParameterReader,
} from '../shared/parameters.js'
import { verifyScryptPassword } from '../shared/password.js'
import { errorResponse, jsonResponse } from '../shared/responses.js'
import {
    parsePasswordRequest,
    RequestValidationError,
} from '../shared/validation.js'

export interface AdminLoginDependencies {
    readonly config: AdminRuntimeConfig
    readonly parameters: ParameterReader
    readonly now: () => number
}

// 閲覧認証とは別のpasswordとCookieを使い、閲覧Cookieだけで管理APIを呼べないようにする。
export function createAdminLoginHandler(dependencies: AdminLoginDependencies) {
    return async (
        event: APIGatewayProxyEventV2,
    ): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            const password = parsePasswordRequest(event.body)
            const passwordHash = await dependencies.parameters.getSecureString(
                dependencies.config.adminPasswordParameterName,
            )
            if (!(await verifyScryptPassword(password, passwordHash))) {
                return errorResponse(
                    401,
                    'INVALID_CREDENTIALS',
                    'Password is incorrect',
                )
            }

            const signingKey = await dependencies.parameters.getSecureString(
                dependencies.config.adminSigningKeyParameterName,
            )
            const expiresAt =
                Math.floor(dependencies.now() / 1000) +
                dependencies.config.adminSessionTtlSeconds
            return jsonResponse(200, { ok: true }, [
                createAdminSessionCookie(signingKey, expiresAt),
            ])
        } catch (error) {
            if (error instanceof RequestValidationError) {
                return errorResponse(400, 'INVALID_REQUEST', error.message)
            }
            // passwordや署名鍵をログへ含めず、利用者にも内部詳細を返さない。
            console.error('Admin login failed because of an internal error')
            return errorResponse(500, 'INTERNAL_ERROR', 'Admin login failed')
        }
    }
}

let runtimeHandler: ReturnType<typeof createAdminLoginHandler> | undefined

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    runtimeHandler ??= createAdminLoginHandler({
        config: loadAdminRuntimeConfig(),
        parameters: new CachedSsmParameterReader(),
        now: Date.now,
    })
    return runtimeHandler(event)
}
