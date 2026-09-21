import { describe, expect, it } from 'vitest'
import { RequestValidationError } from '../shared/validation.js'
import {
    buildMangaImageKey,
    parsePresignRequest,
    PRESIGN_BATCH_SIZE,
} from '../shared/upload.js'

function request(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        workId: 'baburios-abc123',
        chapterId: '001',
        files: [{ name: '001.webp', contentType: 'image/webp' }],
        ...overrides,
    })
}

describe('Presign request validation', () => {
    it('正常値から仕様どおりのS3 Keyを生成する', () => {
        const parsed = parsePresignRequest(request())
        expect(
            buildMangaImageKey(
                parsed.workId,
                parsed.chapterId,
                parsed.files[0]?.name ?? '',
            ),
        ).toBe('manga/baburios-abc123/001/001.webp')
    })

    it.each([
        '../secret',
        'work/chapter',
        'work\\chapter',
        '日本語ID',
        'UPPERCASE',
        '',
    ])('path traversal相当または許可外workIdを拒否する: %s', (workId) => {
        expect(() => parsePresignRequest(request({ workId }))).toThrow(
            RequestValidationError,
        )
    })

    it.each(['1.webp', '001.jpg', '../001.webp', '001.WEBP', 'page.webp'])(
        '不正なpage filenameを拒否する: %s',
        (name) => {
            expect(() =>
                parsePresignRequest(
                    request({
                        files: [{ name, contentType: 'image/webp' }],
                    }),
                ),
            ).toThrow(RequestValidationError)
        },
    )

    it('image/webp以外と重複filenameを拒否する', () => {
        expect(() =>
            parsePresignRequest(
                request({
                    files: [{ name: '001.webp', contentType: 'image/png' }],
                }),
            ),
        ).toThrow(RequestValidationError)
        expect(() =>
            parsePresignRequest(
                request({
                    files: [
                        { name: '001.webp', contentType: 'image/webp' },
                        { name: '001.webp', contentType: 'image/webp' },
                    ],
                }),
            ),
        ).toThrow('Duplicate file name')
    })

    it('100件を許可し、101件以上を拒否する', () => {
        const files = Array.from(
            { length: PRESIGN_BATCH_SIZE },
            (_, index) => ({
                name: `${String(index + 1).padStart(3, '0')}.webp`,
                contentType: 'image/webp',
            }),
        )
        expect(parsePresignRequest(request({ files })).files).toHaveLength(100)
        expect(() =>
            parsePresignRequest(
                request({
                    files: [
                        ...files,
                        { name: '101.webp', contentType: 'image/webp' },
                    ],
                }),
            ),
        ).toThrow(RequestValidationError)
    })
})
