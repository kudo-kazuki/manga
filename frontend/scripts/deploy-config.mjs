import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const localConfigPath = path.join(frontendRoot, '.env.deploy.local')

// Git無視のlocal設定を読み込む。shellで明示した値を優先し、共有sourceにはaccount IDを書かない。
if (existsSync(localConfigPath)) {
    for (const rawLine of readFileSync(localConfigPath, 'utf8').split(
        /\r?\n/,
    )) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const separator = line.indexOf('=')
        if (separator < 0) continue
        const key = line.slice(0, separator).trim()
        const value = line.slice(separator + 1).trim()
        if (key && !(key in process.env)) process.env[key] = value
    }
}

const accountId = process.env.MANGA_DEPLOY_ACCOUNT_ID
if (!/^\d{12}$/.test(accountId ?? '')) {
    throw new Error(
        'MANGA_DEPLOY_ACCOUNT_IDが未設定または不正です。.env.deploy.localへ12桁のAWS account IDを設定してください。',
    )
}

export const deployAccountId = accountId
