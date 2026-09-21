import type { PresignBatch, PresignResponse } from './presignBatches'
import { PRESIGN_BATCH_SIZE } from './presignBatches'
import type { ConversionStatus, ParsedPage, ParsedWork } from './types'
import { AdminAuthenticationError } from './uploadApi'

interface UploadItem {
    readonly chapterId: string
    readonly page: ParsedPage
    status: ConversionStatus
    convertedBytes?: number
    error?: string
}

export interface UploadSnapshot {
    readonly total: number
    readonly converted: number
    readonly uploaded: number
    readonly failed: number
    readonly pending: number
    readonly convertedOriginalBytes: number
    readonly convertedBytes: number
    readonly currentFiles: readonly string[]
}

export interface UploadManagerOptions {
    readonly concurrency: number
    readonly quality: number
    readonly requestPresign: (batch: PresignBatch) => Promise<PresignResponse>
    readonly convert: (file: File, quality: number) => Promise<Blob>
    readonly upload: (url: string, blob: Blob) => Promise<void>
    readonly onChange?: (snapshot: UploadSnapshot) => void
}

export class UploadManager {
    private readonly items: UploadItem[]
    private paused = false
    private pauseWaiters: Array<() => void> = []

    public constructor(
        private readonly work: ParsedWork,
        private readonly options: UploadManagerOptions,
    ) {
        if (
            !Number.isSafeInteger(options.concurrency) ||
            options.concurrency < 1
        ) {
            throw new Error('concurrencyは1以上の整数で指定してください。')
        }
        this.items = work.chapters.flatMap((chapter) =>
            chapter.pages.map((page) => ({
                chapterId: chapter.id,
                page,
                status: 'pending' as const,
            })),
        )
        this.notify()
    }

    public pause(): void {
        this.paused = true
        this.notify()
    }

    public resume(): void {
        this.paused = false
        for (const resolve of this.pauseWaiters.splice(0)) resolve()
        this.notify()
    }

    public async run(): Promise<void> {
        await this.processPending()
    }

    public async retryFailed(): Promise<void> {
        for (const item of this.items) {
            if (item.status === 'failed') {
                item.status = 'pending'
                // Retryでは必ず再変換するため、前回PUT失敗時の集計値も一度取り除く。
                item.convertedBytes = undefined
                item.error = undefined
            }
        }
        this.notify()
        await this.processPending()
    }

    public snapshot(): UploadSnapshot {
        return {
            total: this.items.length,
            converted: this.items.filter(
                (item) => item.convertedBytes !== undefined,
            ).length,
            uploaded: this.items.filter((item) => item.status === 'succeeded')
                .length,
            failed: this.items.filter((item) => item.status === 'failed')
                .length,
            pending: this.items.filter((item) => item.status === 'pending')
                .length,
            // 圧縮率は変換済み画像の元容量と比較する。作品全体容量との比較では、
            // 処理途中に未変換分まで圧縮されたような誤解を招くためである。
            convertedOriginalBytes: this.items.reduce(
                (total, item) =>
                    total +
                    (item.convertedBytes === undefined
                        ? 0
                        : item.page.file.size),
                0,
            ),
            convertedBytes: this.items.reduce(
                (total, item) => total + (item.convertedBytes ?? 0),
                0,
            ),
            currentFiles: this.items
                .filter(
                    (item) =>
                        item.status === 'converting' ||
                        item.status === 'uploading',
                )
                .map((item) => item.page.relativePath),
        }
    }

    private notify(): void {
        this.options.onChange?.(this.snapshot())
    }

    private async waitUntilResumed(): Promise<void> {
        if (!this.paused) return
        await new Promise<void>((resolve) => this.pauseWaiters.push(resolve))
    }

    private createPendingBatches(): UploadItem[][] {
        const batches: UploadItem[][] = []
        for (const chapter of this.work.chapters) {
            const items = this.items.filter(
                (item) =>
                    item.chapterId === chapter.id && item.status === 'pending',
            )
            for (
                let start = 0;
                start < items.length;
                start += PRESIGN_BATCH_SIZE
            ) {
                batches.push(items.slice(start, start + PRESIGN_BATCH_SIZE))
            }
        }
        return batches
    }

    private async processPending(): Promise<void> {
        // URL期限切れを避けるため、全1万件分ではなくbatch直前にだけPresignする。
        for (const batchItems of this.createPendingBatches()) {
            await this.waitUntilResumed()
            let response: PresignResponse
            try {
                response = await this.options.requestPresign({
                    workId: this.work.id,
                    chapterId: batchItems[0]?.chapterId ?? '',
                    files: batchItems.map((item) => ({
                        name: item.page.fileName,
                        contentType: 'image/webp',
                    })),
                })
            } catch (error) {
                // 認証切れはlogin遷移が必要なので上位へ伝え、それ以外はRetry可能にする。
                if (error instanceof AdminAuthenticationError) throw error
                for (const item of batchItems) {
                    item.status = 'failed'
                    item.error =
                        error instanceof Error ? error.message : 'URL取得失敗'
                }
                this.notify()
                continue
            }

            const urls = new Map(
                response.files.map((file) => [
                    file.key.split('/').at(-1),
                    file.uploadUrl,
                ]),
            )
            let nextIndex = 0
            const worker = async () => {
                while (true) {
                    await this.waitUntilResumed()
                    const item = batchItems[nextIndex]
                    nextIndex += 1
                    if (!item) return
                    try {
                        item.status = 'converting'
                        this.notify()
                        const blob = await this.options.convert(
                            item.page.file,
                            this.options.quality,
                        )
                        item.convertedBytes = blob.size
                        item.status = 'uploading'
                        this.notify()
                        const uploadUrl = urls.get(item.page.fileName)
                        if (!uploadUrl)
                            throw new Error('Upload URLが不足しています。')
                        await this.options.upload(uploadUrl, blob)
                        item.status = 'succeeded'
                    } catch (error) {
                        item.status = 'failed'
                        item.error =
                            error instanceof Error
                                ? error.message
                                : 'Uploadに失敗しました。'
                    }
                    // Blobはlocal変数だけなので、このiteration終了後にGC可能になる。
                    this.notify()
                }
            }
            await Promise.all(
                Array.from(
                    {
                        length: Math.min(
                            this.options.concurrency,
                            batchItems.length,
                        ),
                    },
                    worker,
                ),
            )
        }
    }
}
