import { MAX_REQUEST_BODY_BYTES } from './config.js'

export class RequestValidationError extends Error {}

export function parsePasswordRequest(body: string | undefined): string {
    // JSON.parseより前にbyte数を確認し、不要に大きな入力を処理しない。
    if (!body || Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BODY_BYTES) {
        throw new RequestValidationError('Request body is invalid')
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(body)
    } catch {
        throw new RequestValidationError('Request body must be valid JSON')
    }

    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('password' in parsed) ||
        typeof parsed.password !== 'string' ||
        parsed.password.length === 0 ||
        parsed.password.length > 1024
    ) {
        throw new RequestValidationError('Password is required')
    }

    return parsed.password
}

export function parseViewerHost(
    headers: Record<string, string | undefined>,
): string {
    // 通常のHost headerはAPI Gatewayのhostへ変わるため、CloudFront Functionが
    // viewer request時のhostを退避した専用headerを使用する。
    const host = Object.entries(headers).find(
        ([name]) => name.toLowerCase() === 'x-manga-viewer-host',
    )?.[1]

    // policyのResourceへ埋め込む値なので、hostname以外の文字や異常な長さを拒否する。
    if (
        !host ||
        host.length > 253 ||
        !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.test(host) ||
        host.includes('..')
    ) {
        throw new RequestValidationError('Viewer host is invalid')
    }

    return host.toLowerCase()
}
