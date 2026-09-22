/** 指定パスを1枚撮る CLI。 */
import { open, shot, visit } from './lib.mjs'
const args = process.argv.slice(2)
const die = (message) => {
    console.error(`エラー: ${message}`)
    console.error(
        '使い方: node shot.mjs <パス> [--name 名前] [--wait CSS] [--full] [--width px] [--height px]',
    )
    process.exit(1)
}
const flag = (name) => {
    const index = args.indexOf(name)
    if (index === -1) return undefined
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--'))
        die(`${name} に値がありません`)
    return value
}
const size = (name, fallback) => {
    const value = flag(name)
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 200 || parsed > 4000)
        die(`${name} は 200〜4000 の整数で指定してください: ${value}`)
    return parsed
}
const valueFlags = ['--name', '--wait', '--width', '--height']
for (let index = 1; index < args.length; index += 1) {
    if (args[index] === '--full') continue
    if (valueFlags.includes(args[index])) {
        index += 1
        continue
    }
    die(`知らないオプションです: ${args[index]}`)
}
const target = args[0]
if (!target || target.startsWith('--') || !target.startsWith('/'))
    die('パスは / で始めて指定してください（例: /）')
const name =
    flag('--name') ??
    (target === '/'
        ? 'root'
        : target.replace(/^\/|\/$/g, '').replaceAll('/', '_'))
const { browser, page } = await open({
    viewport: { width: size('--width', 1440), height: size('--height', 900) },
})
try {
    await visit(page, target, flag('--wait'))
    await shot(page, name, { fullPage: args.includes('--full') })
} finally {
    await browser.close()
}
