import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deployAccountId } from './deploy-config.mjs'

const REGION = 'ap-northeast-1'
const STACK_NAME = 'MangaStack'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const backendRoot = path.join(repoRoot, 'backend')

// CDK/CloudFormationを実行せず、既存Lambdaの$LATESTコードだけを置き換える対象を固定する。
// environment、IAM、API route、CloudFront、S3などのインフラ変更はこのscriptでは反映できない。
const functions = [
    { logicalIdPrefix: 'ViewerLoginFunction', entry: 'functions/login.ts' },
    { logicalIdPrefix: 'ViewerLogoutFunction', entry: 'functions/logout.ts' },
    {
        logicalIdPrefix: 'AdminLoginFunction',
        entry: 'functions/admin-login.ts',
    },
    {
        logicalIdPrefix: 'AdminLogoutFunction',
        entry: 'functions/admin-logout.ts',
    },
    {
        logicalIdPrefix: 'AdminSessionFunction',
        entry: 'functions/admin-session.ts',
    },
    { logicalIdPrefix: 'PresignFunction', entry: 'functions/presign.ts' },
    {
        logicalIdPrefix: 'CompleteUploadFunction',
        entry: 'functions/complete-upload.ts',
    },
    {
        logicalIdPrefix: 'AdminWorksFunction',
        entry: 'functions/admin-works.ts',
    },
]

function run(command, args, { cwd = repoRoot, capture = false } = {}) {
    const result = spawnSync(command, args, {
        cwd,
        env: {
            ...process.env,
            AWS_REGION: REGION,
            AWS_DEFAULT_REGION: REGION,
        },
        encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit',
        windowsHide: true,
    })
    if (result.error) throw result.error
    if (result.status !== 0) {
        throw new Error(
            `${command} が終了code ${result.status}で失敗しました。`,
        )
    }
    return result.stdout ?? ''
}

function powerShellQuote(value) {
    return `'${value.replaceAll("'", "''")}'`
}

function assertExpectedAccount() {
    const identity = JSON.parse(
        run('aws', ['sts', 'get-caller-identity', '--output', 'json'], {
            capture: true,
        }),
    )
    if (identity.Account !== deployAccountId) {
        throw new Error(
            `AWS account ${identity.Account ?? 'unknown'} は対象外です。設定されたdeploy先accountだけを許可します。`,
        )
    }
}

function resolveFunctionNames() {
    const response = JSON.parse(
        run(
            'aws',
            [
                'cloudformation',
                'describe-stack-resources',
                '--stack-name',
                STACK_NAME,
                '--output',
                'json',
            ],
            { capture: true },
        ),
    )
    const resources = response.StackResources ?? []
    return functions.map((definition) => {
        const matches = resources.filter(
            (resource) =>
                resource.ResourceType === 'AWS::Lambda::Function' &&
                resource.LogicalResourceId.startsWith(
                    definition.logicalIdPrefix,
                ),
        )
        if (matches.length !== 1 || !matches[0].PhysicalResourceId) {
            throw new Error(
                `${definition.logicalIdPrefix}の既存Lambdaを一意に特定できません。通常のCDK deployで状態を確認してください。`,
            )
        }
        return { ...definition, functionName: matches[0].PhysicalResourceId }
    })
}

function bundleAndZip(definition, workDir) {
    const outputDirectory = path.join(workDir, definition.logicalIdPrefix)
    const outputFile = path.join(outputDirectory, 'index.js')
    const zipFile = path.join(workDir, `${definition.logicalIdPrefix}.zip`)
    const esbuild = path.join(
        backendRoot,
        'node_modules',
        'esbuild',
        'bin',
        'esbuild',
    )
    if (!existsSync(esbuild)) {
        throw new Error(
            'backend/node_modulesのesbuildがありません。npm ciを先に実行してください。',
        )
    }

    // AWS SDK v3はLambda Node.js 24 runtime側のものを使用し、CDKのNodejsFunctionと同様にbundleへ含めない。
    const esbuildArgs = [
        path.join(backendRoot, definition.entry),
        '--bundle',
        '--platform=node',
        '--target=node24',
        '--minify',
        '--external:@aws-sdk/*',
        `--outfile=${outputFile}`,
    ]
    // .cmd shimをspawnSyncへ直接渡すとWindowsでEINVALになり得る。
    // esbuild本体をNode.jsから直接実行して、PowerShell/CMDの実行ポリシーにも依存しない。
    if (process.platform === 'win32') {
        run(process.execPath, [esbuild, ...esbuildArgs], { cwd: backendRoot })
    } else {
        run(esbuild, esbuildArgs, { cwd: backendRoot })
    }
    const powerShell =
        process.platform === 'win32'
            ? process.env.SystemRoot
                ? path.join(
                      process.env.SystemRoot,
                      'System32',
                      'WindowsPowerShell',
                      'v1.0',
                      'powershell.exe',
                  )
                : 'powershell.exe'
            : null
    if (!powerShell) {
        throw new Error(
            'このbackend deploy scriptはWindows PowerShellを前提にしています。',
        )
    }
    run(powerShell, [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -LiteralPath ${powerShellQuote(outputFile)} -DestinationPath ${powerShellQuote(zipFile)} -CompressionLevel Optimal`,
    ])
    return zipFile
}

function main() {
    assertExpectedAccount()
    const targets = resolveFunctionNames()
    const workDir = mkdtempSync(path.join(os.tmpdir(), 'manga-lambda-deploy-'))
    try {
        for (const target of targets) {
            console.log(`Bundling ${target.logicalIdPrefix}...`)
            const zipFile = bundleAndZip(target, workDir)
            console.log(`Updating ${target.logicalIdPrefix}...`)
            run('aws', [
                'lambda',
                'update-function-code',
                '--function-name',
                target.functionName,
                '--zip-file',
                `fileb://${zipFile}`,
                '--no-publish',
                '--query',
                'LastModified',
                '--output',
                'text',
            ])
            run('aws', [
                'lambda',
                'wait',
                'function-updated',
                '--function-name',
                target.functionName,
            ])
        }
    } finally {
        // ZipはOS一時directoryだけに作り、sourceや秘密情報をrepositoryへ残さない。
        rmSync(workDir, { recursive: true, force: true })
    }
}

try {
    main()
    console.log('Backend Lambdaコードの更新が完了しました。')
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
}
