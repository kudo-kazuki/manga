import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { createExpiredSignedCookies } from '../shared/cloudfront-cookies.js'
import { jsonResponse } from '../shared/responses.js'

// Cookieの有無に関係なく同じ200を返すため、logoutは何度呼んでも安全である。
export const handler: APIGatewayProxyHandlerV2 = async () =>
    jsonResponse(200, { ok: true }, createExpiredSignedCookies())
