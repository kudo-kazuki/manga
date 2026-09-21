import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const chunks = []

// Passwordをcommand line引数にするとshell履歴やprocess一覧へ残り得るため、stdinだけから読む。
for await (const chunk of process.stdin) chunks.push(chunk)
const password = Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/u, '')

if (password.length < 12 || password.length > 1024) {
    throw new Error('Password must contain 12-1024 characters')
}

const salt = randomBytes(16)
const derivedKey = await scrypt(password, salt, 64)
// BackendのverifyScryptPasswordが読む形式だけをstdoutへ出し、平文は出力しない。
process.stdout.write(
    `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}\n`,
)
