import { describe, expect, it } from 'vitest'
import {
    createCompletionFailurePresentation,
    createItemFailurePresentation,
    createUnexpectedFailurePresentation,
} from './failurePresentation'

describe('upload failure presentation', () => {
    it('S3送信だけの失敗では、失敗した画像だけの再試行を案内する', () => {
        const presentation = createItemFailurePresentation([
            {
                relativePath: '作品/1話/001.jpg',
                kind: 's3-upload',
                message: 'S3 PUTに失敗しました (503)',
            },
        ])

        expect(presentation.title).toBe('S3への画像送信に失敗しました')
        expect(presentation.recommendation).toContain('失敗した画像だけ')
    })

    it('変換と通信が混在した失敗では、原因別の確認を案内する', () => {
        const presentation = createItemFailurePresentation([
            {
                relativePath: '作品/1話/001.jpg',
                kind: 'conversion',
                message: 'decode failed',
            },
            {
                relativePath: '作品/1話/002.jpg',
                kind: 'presign',
                message: 'request failed',
            },
        ])

        expect(presentation.title).toBe('一部の画像を処理できませんでした')
        expect(presentation.kinds).toEqual(['conversion', 'presign'])
    })

    it('S3確認待ちのmetadata失敗では、待機して確定だけ再試行する', () => {
        const presentation = createCompletionFailurePresentation(true)

        expect(presentation.description).toContain('S3での確認')
        expect(presentation.recommendation).toContain('1分ほど待って')
    })

    it('想定外の失敗では、失敗した画像を推測せず再ログインを案内する', () => {
        const presentation = createUnexpectedFailurePresentation()

        expect(presentation.title).toBe(
            'アップロード処理を続行できませんでした',
        )
        expect(presentation.recommendation).toContain('再ログイン')
        expect(presentation.kinds).toEqual([])
    })
})
