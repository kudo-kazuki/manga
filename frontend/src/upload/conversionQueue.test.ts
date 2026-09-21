import { describe, expect, it } from 'vitest'
import { ConversionQueue } from './conversionQueue'
import type { ParsedPage } from './types'

function pages(count: number): ParsedPage[] {
    return Array.from({ length: count }, (_, index) => ({
        id: String(index + 1).padStart(3, '0'),
        fileName: `${String(index + 1).padStart(3, '0')}.webp`,
        originalName: `${index + 1}.jpg`,
        relativePath: `作品/1巻/${index + 1}.jpg`,
        file: new File(['image'], `${index + 1}.jpg`, { type: 'image/jpeg' }),
    }))
}

describe('ConversionQueue', () => {
    it('concurrency上限を超えず、変換結果を順次consumeする', async () => {
        let active = 0
        let maxActive = 0
        const consumed: string[] = []
        const queue = new ConversionQueue(pages(20), {
            concurrency: 3,
            async convert() {
                active += 1
                maxActive = Math.max(maxActive, active)
                await Promise.resolve()
                active -= 1
                return new Blob(['webp'], { type: 'image/webp' })
            },
            async consume(page) {
                consumed.push(page.id)
            },
        })

        await queue.run()

        expect(maxActive).toBeLessThanOrEqual(3)
        expect(consumed).toHaveLength(20)
        expect(queue.items.every(({ status }) => status === 'succeeded')).toBe(
            true,
        )
    })

    it('失敗項目だけをretryする', async () => {
        const attempts = new Map<string, number>()
        const queue = new ConversionQueue(pages(3), {
            concurrency: 2,
            async convert(file) {
                const count = (attempts.get(file.name) ?? 0) + 1
                attempts.set(file.name, count)
                if (file.name === '2.jpg' && count === 1) {
                    throw new Error('temporary failure')
                }
                return new Blob(['webp'])
            },
            async consume() {},
        })

        await queue.run()
        expect(queue.items.map(({ status }) => status)).toEqual([
            'succeeded',
            'failed',
            'succeeded',
        ])

        await queue.retryFailed()
        expect(queue.items.every(({ status }) => status === 'succeeded')).toBe(
            true,
        )
        expect(attempts.get('1.jpg')).toBe(1)
        expect(attempts.get('2.jpg')).toBe(2)
        expect(attempts.get('3.jpg')).toBe(1)
    })

    it('Pause中は実行中の1件を終えた後、新しい変換を開始しない', async () => {
        let releaseFirst: (() => void) | undefined
        let notifyStarted: (() => void) | undefined
        const firstStarted = new Promise<void>((resolve) => {
            notifyStarted = resolve
        })
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        const queue = new ConversionQueue(pages(2), {
            concurrency: 1,
            async convert(file) {
                if (file.name === '1.jpg') {
                    notifyStarted?.()
                    await firstGate
                }
                return new Blob(['webp'])
            },
            async consume() {},
        })

        const running = queue.run()
        await firstStarted
        queue.pause()
        releaseFirst?.()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(queue.items.map(({ status }) => status)).toEqual([
            'succeeded',
            'pending',
        ])
        queue.resume()
        await running
        expect(queue.items.every(({ status }) => status === 'succeeded')).toBe(
            true,
        )
    })
})
