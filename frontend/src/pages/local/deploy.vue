<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type JobId = 'backend' | 'frontend'

interface Job {
    readonly id: JobId
    readonly label: string
    readonly detail: string
    readonly warning: string
}

interface Snapshot {
    readonly isRunning: boolean
    readonly currentJobId: JobId | null
    readonly currentJobLabel: string | null
    readonly startedAt: string | null
    readonly finishedAt: string | null
    readonly logText: string
    readonly lastResult: {
        readonly success: boolean
        readonly jobLabel: string
    } | null
}

const RUNNER_URL = 'http://127.0.0.1:5175'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])
const jobs: readonly Job[] = [
    {
        id: 'backend',
        label: 'Backend Lambdaを更新',
        detail: 'backend/ をbundleして既存Lambdaコードだけを更新',
        warning: 'CDK・CloudFormation・S3・CloudFront設定は変更しません。',
    },
    {
        id: 'frontend',
        label: 'Frontendを配信',
        detail: 'build → Frontend S3 upload → CloudFront invalidation',
        warning: 'インフラ変更は行わず、画面配信だけを更新します。',
    },
]

const isAvailable = computed(
    () => import.meta.env.DEV && LOCAL_HOSTS.has(window.location.hostname),
)
const status = ref('ローカルrunnerへ未接続')
const isRunning = ref(false)
const currentJobId = ref<JobId | null>(null)
const logText = ref('')
const message = ref('`npm run dev:deploy-console`でrunnerを起動してください。')
const eventSource = ref<EventSource | null>(null)
const isSubmitting = ref(false)

const statusClass = computed(() => {
    if (isRunning.value) return 'is-running'
    if (status.value === '成功') return 'is-success'
    if (status.value === '失敗') return 'is-failure'
    return 'is-idle'
})

function applySnapshot(snapshot: Snapshot) {
    isRunning.value = snapshot.isRunning
    currentJobId.value = snapshot.currentJobId
    logText.value = snapshot.logText
    isSubmitting.value = false
    if (snapshot.isRunning) {
        status.value = '実行中'
        message.value = `${snapshot.currentJobLabel ?? 'deploy'}を実行しています。`
    } else if (snapshot.lastResult) {
        status.value = snapshot.lastResult.success ? '成功' : '失敗'
        message.value = snapshot.lastResult.success
            ? `${snapshot.lastResult.jobLabel}が完了しました。`
            : `${snapshot.lastResult.jobLabel}が失敗しました。実行ログを確認してください。`
    } else {
        status.value = '待機中'
        message.value = 'ローカルrunnerは待機中です。'
    }
}

function connect() {
    if (!isAvailable.value) return
    const source = new EventSource(`${RUNNER_URL}/api/events`)
    eventSource.value = source
    source.addEventListener('snapshot', (event) =>
        applySnapshot(
            JSON.parse((event as MessageEvent<string>).data) as Snapshot,
        ),
    )
    source.addEventListener('status', (event) =>
        applySnapshot(
            JSON.parse((event as MessageEvent<string>).data) as Snapshot,
        ),
    )
    source.addEventListener('log', (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
            chunk: string
        }
        logText.value += payload.chunk
    })
    source.onerror = () => {
        if (!isRunning.value) {
            status.value = '未接続'
            message.value =
                '`npm run dev:deploy-console`でrunnerを起動してください。'
        }
    }
}

async function startJob(job: Job) {
    // button無効化に加え、event重複でも同時deployを開始しない。
    if (!isAvailable.value || isRunning.value || isSubmitting.value) return
    isSubmitting.value = true
    try {
        const response = await fetch(`${RUNNER_URL}/api/jobs/${job.id}`, {
            method: 'POST',
        })
        if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
                message?: string
            } | null
            throw new Error(
                payload?.message ?? 'deployを開始できませんでした。',
            )
        }
    } catch (error) {
        status.value = '失敗'
        message.value =
            error instanceof Error
                ? error.message
                : 'deployの開始に失敗しました。'
        isSubmitting.value = false
    }
}

onMounted(connect)
onBeforeUnmount(() => eventSource.value?.close())
</script>

<template>
    <main v-if="isAvailable" class="LocalDeploy">
        <section class="LocalDeploy__panel">
            <p class="LocalDeploy__eyebrow">LOCAL ONLY</p>
            <h1>デプロイ実行コンソール</h1>
            <p>
                この画面はlocal開発時だけ表示されます。runnerは127.0.0.1でのみ待受け、固定された2種類のdeployだけを実行します。
            </p>
            <p class="LocalDeploy__notice">
                runnerを起動したPowerShellで<code
                    >$env:AWS_PROFILE = '&lt;your-aws-profile&gt;'</code
                >を設定してください。
            </p>

            <div class="LocalDeploy__status">
                <span>状態</span>
                <strong :class="statusClass">{{ status }}</strong>
                <p>{{ message }}</p>
            </div>

            <div class="LocalDeploy__jobs">
                <button
                    v-for="job in jobs"
                    :key="job.id"
                    type="button"
                    :disabled="isRunning || isSubmitting"
                    @click="startJob(job)"
                >
                    <strong>{{ job.label }}</strong>
                    <span>{{ job.detail }}</span>
                    <small>{{ job.warning }}</small>
                </button>
            </div>

            <section class="LocalDeploy__logs">
                <header>
                    <h2>実行ログ</h2>
                    <span>{{ isRunning ? 'streaming...' : 'idle' }}</span>
                </header>
                <pre>{{ logText || 'まだログはありません。' }}</pre>
            </section>
        </section>
    </main>
</template>

<style scoped lang="scss">
.LocalDeploy {
    min-height: 100%;
    padding: 32px 18px;
    background: linear-gradient(145deg, #edf2f8, #f5eee4);

    &__panel {
        width: min(100%, 960px);
        padding: 28px;
        margin: 0 auto;
        border: 1px solid #dbe0e7;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: 0 18px 48px rgba(45, 63, 98, 0.12);
    }

    &__eyebrow {
        color: #8a5b22;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
    }

    h1 {
        margin-top: 8px;
    }

    &__notice {
        padding: 12px;
        border-radius: 8px;
        background: #fff4e5;
        color: #74400e;
    }

    code {
        font-family: Consolas, monospace;
    }

    &__status {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px 18px;
        padding: 16px;
        margin-top: 22px;
        border: 1px solid #e2e5e9;
        border-radius: 12px;

        p {
            grid-column: 1 / -1;
            margin: 0;
            color: #596579;
        }
        strong {
            font-size: 21px;
        }
        .is-idle {
            color: #31567a;
        }
        .is-running {
            color: #9a5b0c;
        }
        .is-success {
            color: #147246;
        }
        .is-failure {
            color: #b42318;
        }
    }

    &__jobs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin-top: 18px;

        button {
            display: grid;
            gap: 8px;
            min-height: 150px;
            padding: 20px;
            border: 1px solid #bdc9d6;
            border-radius: 12px;
            background: #fff;
            color: #26384c;
            text-align: left;
            cursor: pointer;
        }
        button:hover:not(:disabled) {
            border-color: #58789b;
            background: #f7fbff;
        }
        button:disabled {
            cursor: not-allowed;
            opacity: 0.56;
        }
        strong {
            font-size: 18px;
        }
        span {
            color: #4e6074;
        }
        small {
            color: #8a5b22;
            line-height: 1.5;
        }
    }

    &__logs {
        margin-top: 18px;
        overflow: hidden;
        border-radius: 12px;
        background: #08111f;
        color: #d7f6e4;

        header {
            display: flex;
            justify-content: space-between;
            padding: 14px 16px;
            background: #111d30;
        }
        h2 {
            margin: 0;
            font-size: 16px;
        }
        pre {
            min-height: 280px;
            max-height: 55vh;
            padding: 16px;
            margin: 0;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
        }
    }

    @media (max-width: 640px) {
        &__panel {
            padding: 20px;
        }
        &__jobs {
            grid-template-columns: 1fr;
        }
    }
}
</style>
