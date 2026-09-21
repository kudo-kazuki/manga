import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { createExpiredAdminSessionCookie } from '../shared/admin-session.js'
import { jsonResponse } from '../shared/responses.js'

// 管理Cookieが存在しない場合も200にする冪等なlogout API。
export const handler: APIGatewayProxyHandlerV2 = async () =>
    jsonResponse(200, { ok: true }, [createExpiredAdminSessionCookie()])
