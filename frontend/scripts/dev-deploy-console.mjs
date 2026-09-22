import net from 'node:net'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VITE_PORT = 4646
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const npmCommand =
    process.platform === 'win32'
        ? path.join(path.dirname(process.execPath), 'npm.cmd')
        : 'npm'
const children = []

function prefixOutput(name, chunk) {
    for (const line of String(chunk).split(/\r?\n/)) {
        if (line) console.log(`[${name}] ${line}`)
    }
}

function startProcess(name, command, args) {
    const child = spawn(command, args, {
        cwd: frontendRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
        env: process.env,
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => prefixOutput(name, chunk))
    child.stderr.on('data', (chunk) => prefixOutput(name, chunk))
    child.on('exit', (code, signal) => {
        console.log(
            `[${name}] exited: ${signal ?? `code ${code ?? 'unknown'}`}`,
        )
        if (name === 'runner') process.exitCode = code ?? 1
    })
    children.push(child)
}

function isViteRunning() {
    return new Promise((resolve) => {
        const socket = net.createConnection({
            host: '127.0.0.1',
            port: VITE_PORT,
        })
        socket.setTimeout(1_000)
        const finish = (result) => {
            socket.destroy()
            resolve(result)
        }
        socket.once('connect', () => finish(true))
        socket.once('timeout', () => finish(false))
        socket.once('error', () => finish(false))
    })
}

function shutdown() {
    for (const child of children) {
        if (!child.killed) child.kill()
    }
}

process.on('SIGINT', () => {
    shutdown()
    process.exit(0)
})
process.on('SIGTERM', () => {
    shutdown()
    process.exit(0)
})

startProcess('runner', process.execPath, [
    path.join(__dirname, 'local-deploy-runner.mjs'),
])
if (await isViteRunning()) {
    console.log(
        `既存のVite開発サーバー (port ${VITE_PORT}) をそのまま利用します。`,
    )
} else {
    startProcess('frontend', npmCommand, ['run', 'dev'])
}
