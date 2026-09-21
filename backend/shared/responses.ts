import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'

export interface ApiErrorBody {
    readonly ok: false
    readonly error: {
        readonly code: string
        readonly message: string
    }
}

export function jsonResponse(
    statusCode: number,
    body: unknown,
    cookies?: readonly string[],
): APIGatewayProxyStructuredResultV2 {
    // 認証APIの結果がCloudFrontやブラウザに残らないよう、成功・失敗ともcache禁止にする。
    return {
        statusCode,
        headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
        // HTTP API payload v2では、複数のSet-Cookieをcookies配列で返す。
        ...(cookies ? { cookies: [...cookies] } : {}),
    }
}

export function errorResponse(
    statusCode: number,
    code: string,
    message: string,
): APIGatewayProxyStructuredResultV2 {
    return jsonResponse(statusCode, {
        ok: false,
        error: { code, message },
    } satisfies ApiErrorBody)
}
