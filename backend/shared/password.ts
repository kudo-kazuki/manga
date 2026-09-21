import { scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

// SSMには平文passwordではなく「scrypt$base64(salt)$base64(hash)」形式だけを保存する。
export async function verifyScryptPassword(
    password: string,
    encodedHash: string,
): Promise<boolean> {
    const [algorithm, saltBase64, hashBase64] = encodedHash.split('$')
    if (algorithm !== 'scrypt' || !saltBase64 || !hashBase64) {
        return false
    }

    let salt: Buffer
    let expected: Buffer
    try {
        salt = Buffer.from(saltBase64, 'base64')
        expected = Buffer.from(hashBase64, 'base64')
    } catch {
        return false
    }

    if (salt.length < 16 || expected.length < 32) {
        return false
    }

    const actual = (await scrypt(password, salt, expected.length)) as Buffer
    // 単純比較は一致位置によって処理時間が変わり得るため、必ずtiming-safe比較を使う。
    return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
    )
}
