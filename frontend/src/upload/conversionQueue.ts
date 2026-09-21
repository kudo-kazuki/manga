import type { ConversionItem, ParsedPage } from './types'

export interface ConversionQueueOptions {
    readonly concurrency: number
    readonly convert: (file: File) => Promise<Blob>
    readonly consume: (page: ParsedPage, blob: Blob) => Promise<void>
}

// 変換済みBlobをqueueへ保存せずconsume後すぐ参照から外すことで、
// 1万画像分のWebPを同時にRAMへ保持しない。
export class ConversionQueue {
    public readonly items: ConversionItem[]
    private paused = false
    private pauseWaiters: Array<() => void> = []

    public constructor(
        pages: readonly ParsedPage[],
        private readonly options: ConversionQueueOptions,
    ) {
        if (
            !Number.isSafeInteger(options.concurrency) ||
            options.concurrency < 1
        ) {
            throw new Error('concurrencyは1以上の整数で指定してください。')
        }
        this.items = pages.map((page) => ({ page, status: 'pending' }))
    }

    public pause(): void {
        this.paused = true
    }

    public resume(): void {
        this.paused = false
        for (const resolve of this.pauseWaiters.splice(0)) resolve()
    }

    public async run(): Promise<void> {
        const workers = Array.from(
            { length: Math.min(this.options.concurrency, this.items.length) },
            () => this.worker(),
        )
        await Promise.all(workers)
    }

    public async retryFailed(): Promise<void> {
        for (const item of this.items) {
            if (item.status === 'failed') {
                item.status = 'pending'
                item.error = undefined
            }
        }
        await this.run()
    }

    private async waitUntilResumed(): Promise<void> {
        if (!this.paused) return
        await new Promise<void>((resolve) => this.pauseWaiters.push(resolve))
    }

    private async worker(): Promise<void> {
        while (true) {
            await this.waitUntilResumed()
            // JavaScriptの同期区間でpendingをconvertingへ変えるため、worker間で同じitemを奪わない。
            const item = this.items.find(({ status }) => status === 'pending')
            if (!item) return
            item.status = 'converting'
            try {
                const blob = await this.options.convert(item.page.file)
                item.convertedBytes = blob.size
                await this.options.consume(item.page, blob)
                item.status = 'succeeded'
            } catch (error) {
                item.status = 'failed'
                item.error =
                    error instanceof Error
                        ? error.message
                        : '変換に失敗しました。'
            }
        }
    }
}
