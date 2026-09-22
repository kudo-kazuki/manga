import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REGION = 'ap-northeast-1'
const ACCOUNT_ID = '702347290971'
const STACK_NAME = 'MangaStack'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const npmCommand =
    process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm'

function run(command, args, { cwd = frontendRoot, capture = false } = {}) {
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

function assertExpectedAccount() {
    const identity = JSON.parse(
        run('aws', ['sts', 'get-caller-identity', '--output', 'json'], {
            capture: true,
        }),
    )
    if (identity.Account !== ACCOUNT_ID) {
        throw new Error(
            `AWS account ${identity.Account ?? 'unknown'} は対象外です。${ACCOUNT_ID}だけを許可します。`,
        )
    }
}

function resolveDeploymentTargets() {
    const response = JSON.parse(
        run(
            'aws',
            [
                'cloudformation',
                'describe-stacks',
                '--stack-name',
                STACK_NAME,
                '--output',
                'json',
            ],
            { capture: true },
        ),
    )
    const outputs = response.Stacks?.[0]?.Outputs ?? []
    const values = new Map(
        outputs.map((output) => [output.OutputKey, output.OutputValue]),
    )
    const bucketName = values.get('FrontendBucketName')
    const distributionId = values.get('DistributionId')
    if (!bucketName || !distributionId) {
        throw new Error(
            'MangaStackのFrontendBucketNameまたはDistributionIdを取得できません。',
        )
    }
    return { bucketName, distributionId }
}

function runNpm(args) {
    // Windowsではnpm.cmdをspawnSyncへ直接渡すとEINVALになる環境がある。
    // GatherModokiと同様、cmd.exe経由で固定のnpm commandだけを起動する。
    if (process.platform === 'win32') {
        return run(npmCommand, ['/d', '/s', '/c', `npm ${args.join(' ')}`])
    }
    return run(npmCommand, args)
}

function main() {
    assertExpectedAccount()
    const { bucketName, distributionId } = resolveDeploymentTargets()
    runNpm(['run', 'build'])

    // index.htmlを最後に更新し、短時間古いindexを握るBrowserが新しいasset未配信で白画面になるのを防ぐ。
    // --deleteは使わない。古いhash付きassetは次回以降のCDK deployで安全に整理する。
    run('aws', [
        's3',
        'sync',
        'dist/',
        `s3://${bucketName}`,
        '--exclude',
        'index.html',
        '--cache-control',
        'public,max-age=31536000,immutable',
    ])
    run('aws', [
        's3',
        'cp',
        'dist/index.html',
        `s3://${bucketName}/index.html`,
        '--content-type',
        'text/html;charset=utf-8',
        '--cache-control',
        'no-cache,no-store,must-revalidate',
    ])
    run('aws', [
        'cloudfront',
        'create-invalidation',
        '--distribution-id',
        distributionId,
        '--paths',
        '/*',
        '--query',
        'Invalidation.Id',
        '--output',
        'text',
    ])
}

try {
    main()
    console.log(
        'Frontendのbuild、S3 upload、CloudFront invalidation要求が完了しました。',
    )
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
}
