import { randomBytes } from 'node:crypto'

// 管理CookieのHMAC-SHA256署名用。32 byteの乱数をURL-safeな文字列で出力する。
process.stdout.write(`${randomBytes(32).toString('base64url')}\n`)
