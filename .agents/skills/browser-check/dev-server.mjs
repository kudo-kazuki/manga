/** Windows で frontend の dev サーバーを安全に管理する。 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE, FRONTEND_ROOT, OUT } from './lib.mjs'
const PORT = Number(new URL(BASE).port || 80)
const MARKER = path.join(OUT, 'dev-server.json')
const LOG = path.join(OUT, 'dev-server.log')
const npmCommand = process.execPath
const npmArgs = [
    path.join(
        path.dirname(process.execPath),
        'node_modules',
        'npm',
        'bin',
        'npm-cli.js',
    ),
    'run',
    'dev',
]
const netstat = () => {
    try {
        return execFileSync('netstat', ['-ano', '-p', 'tcp'], {
            encoding: 'utf8',
        })
    } catch {
        return ''
    }
}
export const listeningPid = () => {
    for (const line of netstat().split(/\r?\n/)) {
        const fields = line.trim().split(/\s+/)
        if (
            fields[0] === 'TCP' &&
            fields[3] === 'LISTENING' &&
            fields[1]?.endsWith(`:${PORT}`)
        )
            return Number(fields[4]) || null
    }
    return null
}
const processInfo = (pid) => {
    try {
        const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p){[pscustomobject]@{pid=$p.ProcessId;ppid=$p.ParentProcessId;commandLine=$p.CommandLine;created=$p.CreationDate.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress}`
        const output = execFileSync(
            'powershell.exe',
            ['-NoProfile', '-Command', script],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim()
        return output ? JSON.parse(output) : null
    } catch {
        return null
    }
}
const isAlive = (pid) => processInfo(pid) !== null
const isDescendantOf = (pid, ancestor) => {
    let current = pid
    for (let depth = 0; depth < 40 && current; depth += 1) {
        if (current === ancestor) return true
        current = processInfo(current)?.ppid ?? 0
    }
    return false
}
const readMarker = () => {
    try {
        return JSON.parse(fs.readFileSync(MARKER, 'utf8'))
    } catch {
        return null
    }
}
const markerIsFresh = (marker) => {
    if (!marker?.pid || !marker.startedAt) return false
    const info = processInfo(marker.pid)
    return (
        Boolean(info?.created) &&
        Math.abs(Date.parse(info.created) - Date.parse(marker.startedAt)) <
            60_000
    )
}
export const ownership = () => {
    const pid = listeningPid()
    const saved = readMarker()
    const marker = markerIsFresh(saved) ? saved : null
    if (pid === null)
        return {
            state: marker && isAlive(marker.pid) ? 'unknown' : 'none',
            pid,
            marker,
        }
    if (!marker?.listenPid) return { state: 'theirs', pid, marker: null }
    return { state: pid === marker.listenPid ? 'mine' : 'theirs', pid, marker }
}
const reachable = async () => {
    try {
        return (await fetch(BASE, { signal: AbortSignal.timeout(3_000) })).ok
    } catch {
        return false
    }
}
const labels = {
    none: '起動していない',
    mine: 'このスキルが起動したもの（停止してよい）',
    theirs: '既存のサーバー（停止しない）',
    unknown: '所有者不明（停止しない）',
}
const status = async () => {
    const owner = ownership()
    const up = await reachable()
    console.log(
        `${BASE}: ${up ? '応答あり' : '応答なし'} / ${labels[owner.state]}`,
    )
    if (owner.pid)
        console.log(
            `  LISTEN pid=${owner.pid}  ${processInfo(owner.pid)?.commandLine ?? '取得できません'}`,
        )
    return { ...owner, up }
}
const terminateTree = (pid) => {
    try {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
            stdio: 'ignore',
        })
        return true
    } catch {
        return false
    }
}
const start = async () => {
    const current = await status()
    if (current.up) {
        console.log('既存のサーバーをそのまま利用します。')
        return 0
    }
    if (current.state !== 'none') {
        console.log(
            `ポート ${PORT} の所有者を安全に判定できないため起動しません。`,
        )
        return 1
    }
    const log = fs.openSync(LOG, 'a')
    const child = spawn(npmCommand, npmArgs, {
        cwd: FRONTEND_ROOT,
        detached: true,
        stdio: ['ignore', log, log],
        windowsHide: true,
    })
    child.unref()
    fs.writeFileSync(
        MARKER,
        JSON.stringify({
            pid: child.pid,
            startedAt: new Date().toISOString(),
            listenPid: null,
        }),
    )
    console.log(`起動しました（pid=${child.pid}）。応答を待ちます…`)
    for (let waited = 0; waited < 120; waited += 2) {
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        if (await reachable()) {
            const pid = listeningPid()
            if (pid !== null && isDescendantOf(pid, child.pid)) {
                fs.writeFileSync(
                    MARKER,
                    JSON.stringify({ ...readMarker(), listenPid: pid }),
                )
                console.log(`${BASE} が応答しました。`)
                return 0
            }
            console.log(
                '起動したプロセスと LISTEN ポートの対応を確認できないため停止します。',
            )
            terminateTree(child.pid)
            fs.rmSync(MARKER, { force: true })
            return 1
        }
    }
    console.log(`120秒待っても応答しませんでした。ログ: ${LOG}`)
    terminateTree(child.pid)
    fs.rmSync(MARKER, { force: true })
    return 1
}
const stop = async () => {
    const current = ownership()
    if (current.state !== 'mine' || !current.marker) {
        console.log('このスキルが起動したサーバーではないため停止しません。')
        return 0
    }
    console.log(
        terminateTree(current.marker.pid)
            ? `停止: pid=${current.marker.pid}`
            : `停止できません: pid=${current.marker.pid}`,
    )
    fs.rmSync(MARKER, { force: true })
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    console.log(
        (await reachable())
            ? 'まだ応答があります。確認してください。'
            : '停止を確認しました。',
    )
    return 0
}
const direct =
    process.argv[1] &&
    path.basename(process.argv[1]).toLowerCase() === 'dev-server.mjs'
if (direct) {
    const command = process.argv[2] ?? 'status'
    if (command === 'status') {
        await status()
        process.exitCode = 0
    } else if (command === 'start') process.exitCode = await start()
    else if (command === 'stop') process.exitCode = await stop()
    else process.exitCode = 1
    if (!['status', 'start', 'stop'].includes(command))
        console.log('使い方: node dev-server.mjs [status|start|stop]')
}
