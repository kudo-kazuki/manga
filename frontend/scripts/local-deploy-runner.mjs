import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const PORT = 5175
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])
const LOCAL_ORIGINS = new Set([
    'http://127.0.0.1:4646',
    'http://localhost:4646',
])
const LOCAL_REMOTE_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const npmCommand =
    process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm'

// Browserから任意commandを渡せないよう、更新対象は安全性を確認した2ジョブだけに固定する。
const jobs = {
    backend: {
        id: 'backend',
        label: 'Backend Lambdaコードのみ',
        script: 'deploy:backend',
    },
    frontend: {
        id: 'frontend',
        label: 'Frontend（build → S3 → CloudFront）',
        script: 'deploy:frontend',
    },
}

const clients = new Set()
const state = {
    isRunning: false,
    currentJobId: null,
    currentJobLabel: null,
    startedAt: null,
    finishedAt: null,
    logText: '',
    lastResult: null,
}

function isLocalRequest(request) {
    if (!LOCAL_REMOTE_ADDRESSES.has(request.socket.remoteAddress ?? '')) {
        return false
    }
    const host = (request.headers.host ?? '').split(':')[0].toLowerCase()
    if (host && !LOCAL_HOSTS.has(host)) return false
    const origin = request.headers.origin
    return !origin || LOCAL_ORIGINS.has(origin)
}

function applyCorsHeaders(response, origin) {
    if (!origin) return
    if (!LOCAL_ORIGINS.has(origin)) return
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.setHeader('Vary', 'Origin')
}

function writeJson(response, statusCode, payload, origin) {
    applyCorsHeaders(response, origin)
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    })
    response.end(JSON.stringify(payload))
}

function snapshot() {
    return { ...state }
}

function sendEvent(response, name, payload) {
    response.write(`event: ${name}\n`)
    response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcast(name, payload) {
    for (const client of clients) sendEvent(client, name, payload)
}

function appendLog(chunk) {
    const text = String(chunk)
    state.logText += text
    broadcast('log', { chunk: text })
}

function finishJob(job, exitCode, signal) {
    state.isRunning = false
    state.finishedAt = new Date().toISOString()
    state.lastResult = {
        jobId: job.id,
        jobLabel: job.label,
        success: exitCode === 0,
        exitCode,
        signal,
        finishedAt: state.finishedAt,
    }
    state.currentJobId = null
    state.currentJobLabel = null
    broadcast('status', snapshot())
}

function startJob(jobId, response, origin) {
    const job = jobs[jobId]
    if (!job) {
        writeJson(response, 404, { message: '未定義のジョブです。' }, origin)
        return
    }
    if (state.isRunning) {
        writeJson(
            response,
            409,
            {
                message: '別のdeployが実行中です。',
                currentJobLabel: state.currentJobLabel,
            },
            origin,
        )
        return
    }

    state.isRunning = true
    state.currentJobId = job.id
    state.currentJobLabel = job.label
    state.startedAt = new Date().toISOString()
    state.finishedAt = null
    state.logText = ''
    state.lastResult = null
    broadcast('status', snapshot())

    let child
    try {
        // npm.cmdをNodeから直接spawnするとWindows環境によってEINVALになる。
        // GatherModokiと同じcmd.exe経由にし、実行commandは固定jobからしか組み立てない。
        const commandArgs =
            process.platform === 'win32'
                ? ['/d', '/s', '/c', `npm run ${job.script}`]
                : ['run', job.script]
        child = spawn(npmCommand, commandArgs, {
            cwd: frontendRoot,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            windowsHide: true,
        })
    } catch (error) {
        appendLog(
            `${error instanceof Error ? error.message : 'ジョブ起動に失敗しました。'}\n`,
        )
        finishJob(job, null, null)
        writeJson(
            response,
            500,
            { message: 'ジョブ起動に失敗しました。' },
            origin,
        )
        return
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', appendLog)
    child.stderr.on('data', appendLog)
    child.on('error', (error) => appendLog(`${error.message}\n`))
    child.on('close', (exitCode, signal) => finishJob(job, exitCode, signal))
    writeJson(response, 202, { accepted: true, jobId: job.id }, origin)
}

const server = http.createServer((request, response) => {
    const origin = request.headers.origin
    if (!isLocalRequest(request)) {
        writeJson(
            response,
            403,
            { message: 'ローカル環境以外からは利用できません。' },
            origin,
        )
        return
    }
    const url = new URL(
        request.url ?? '/',
        `http://${request.headers.host ?? `${HOST}:${PORT}`}`,
    )
    if (request.method === 'OPTIONS') {
        applyCorsHeaders(response, origin)
        response.writeHead(204)
        response.end()
        return
    }
    if (request.method === 'GET' && url.pathname === '/health') {
        writeJson(response, 200, { ok: true }, origin)
        return
    }
    if (request.method === 'GET' && url.pathname === '/api/events') {
        applyCorsHeaders(response, origin)
        response.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        })
        response.write(': connected\n\n')
        clients.add(response)
        sendEvent(response, 'snapshot', snapshot())
        const keepAlive = setInterval(
            () => response.write(': keepalive\n\n'),
            15_000,
        )
        request.on('close', () => {
            clearInterval(keepAlive)
            clients.delete(response)
        })
        return
    }
    if (request.method === 'POST' && url.pathname.startsWith('/api/jobs/')) {
        startJob(url.pathname.slice('/api/jobs/'.length), response, origin)
        return
    }
    writeJson(response, 404, { message: 'Not Found' }, origin)
})

server.listen(PORT, HOST, () => {
    console.log(`Local deploy runner listening on http://${HOST}:${PORT}`)
})
