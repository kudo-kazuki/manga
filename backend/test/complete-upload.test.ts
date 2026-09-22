import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { describe, expect, it } from 'vitest'
import {
    createCompleteUploadHandler,
    IndexWriteConflictError,
    type CompleteUploadStorage,
} from '../functions/complete-upload.js'
import {
    ADMIN_COOKIE_NAME,
    createAdminSessionCookie,
    readCookie,
} from '../shared/admin-session.js'
import {
    expectedImageKeys,
    parseCompleteUploadRequest,
    type MangaIndex,
    type MangaMetadata,
} from '../shared/metadata.js'
import type { ParameterReader } from '../shared/parameters.js'
import { RequestValidationError } from '../shared/validation.js'

const signingKey = 'complete-upload-signing-key-with-enough-randomness'
const signingKeyParameterName = '/manga/admin-signing-key'
const now = new Date('2026-09-21T12:00:00.000Z')

function request(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        workId: 'baburios-abc123',
        title: 'バブリオス',
        chapters: [
            { id: '001', title: '1巻', pages: 2 },
            { id: '002', title: '2巻', pages: 1 },
        ],
        ...overrides,
    })
}

class MemoryStorage implements CompleteUploadStorage {
    public readonly objects = new Map<string, number>()
    public readonly metadataWrites: Array<{
        key: string
        metadata: MangaMetadata
    }> = []
    public index: MangaIndex | undefined
    public indexETag: string | undefined
    public conflictIndex: MangaIndex | undefined
    public indexWriteAttempts = 0

    public async listObjects(): Promise<ReadonlyMap<string, number>> {
        return this.objects
    }

    public async writeMetadata(
        key: string,
        metadata: MangaMetadata,
    ): Promise<void> {
        this.metadataWrites.push({ key, metadata })
    }

    public async readIndex() {
        if (!this.index || !this.indexETag) return undefined
        return { body: JSON.stringify(this.index), eTag: this.indexETag }
    }

    public async writeIndex(
        index: MangaIndex,
        expectedETag: string | undefined,
    ): Promise<void> {
        this.indexWriteAttempts += 1
        if (this.conflictIndex) {
            // 別Lambdaが先にindexを更新した状況を再現し、次のreadでその内容を返す。
            this.index = this.conflictIndex
            this.indexETag = 'etag-concurrent'
            this.conflictIndex = undefined
            throw new IndexWriteConflictError()
        }
        if (expectedETag !== this.indexETag) {
            throw new IndexWriteConflictError()
        }
        this.index = index
        this.indexETag = `etag-${this.indexWriteAttempts}`
    }
}

const parameters: ParameterReader = {
    async getSecureString(name) {
        if (name !== signingKeyParameterName) throw new Error('unexpected')
        return signingKey
    },
}

function event(body = request(), authenticated = true): APIGatewayProxyEventV2 {
    const responseCookie = createAdminSessionCookie(
        signingKey,
        Math.floor(now.getTime() / 1000) + 60,
    )
    const cookieValue = readCookie([responseCookie], ADMIN_COOKIE_NAME)
    return {
        version: '2.0',
        routeKey: 'POST /api/upload/complete',
        rawPath: '/api/upload/complete',
        rawQueryString: '',
        headers: { 'content-type': 'application/json' },
        requestContext: {} as APIGatewayProxyEventV2['requestContext'],
        isBase64Encoded: false,
        body,
        ...(authenticated && cookieValue
            ? { cookies: [`${ADMIN_COOKIE_NAME}=${cookieValue}`] }
            : {}),
    }
}

function createHandler(storage: MemoryStorage) {
    return createCompleteUploadHandler({
        adminSigningKeyParameterName: signingKeyParameterName,
        parameters,
        storage,
        now: () => now,
    })
}

function addExpectedImages(storage: MemoryStorage): void {
    const parsed = parseCompleteUploadRequest(request())
    for (const key of expectedImageKeys(parsed)) storage.objects.set(key, 100)
}

describe('Complete upload validation', () => {
    it('表示用の日本語titleを保持し、IDとpage数を検証する', () => {
        expect(parseCompleteUploadRequest(request()).title).toBe('バブリオス')
        expect(() =>
            parseCompleteUploadRequest(request({ workId: '../secret' })),
        ).toThrow(RequestValidationError)
        expect(() =>
            parseCompleteUploadRequest(
                request({
                    chapters: [
                        { id: '001', title: '1巻', pages: 1 },
                        { id: '001', title: '2巻', pages: 1 },
                    ],
                }),
            ),
        ).toThrow('Duplicate chapter id')
    })

    it.each([1_000, 10_000])(
        '%i pagesでもFrontendと同じ最低3桁の画像keyを組み立てる',
        (pages) => {
            const parsed = parseCompleteUploadRequest(
                request({ chapters: [{ id: '001', title: '1巻', pages }] }),
            )
            const keys = expectedImageKeys(parsed)

            expect(keys[0]).toBe('manga/baburios-abc123/001/001.webp')
            expect(keys[998]).toBe('manga/baburios-abc123/001/999.webp')
            expect(keys[999]).toBe('manga/baburios-abc123/001/1000.webp')
            expect(keys.at(-1)).toBe(`manga/baburios-abc123/001/${pages}.webp`)
        },
    )
})

describe('Complete upload handler', () => {
    it('未認証requestを拒否する', async () => {
        const storage = new MemoryStorage()
        const response = await createHandler(storage)(event(request(), false))
        expect(response.statusCode).toBe(401)
        expect(storage.metadataWrites).toHaveLength(0)
    })

    it('画像が1件でも不足するとmetadataとindexを書かない', async () => {
        const storage = new MemoryStorage()
        addExpectedImages(storage)
        storage.objects.delete('manga/baburios-abc123/002/001.webp')

        const response = await createHandler(storage)(event())

        expect(response.statusCode).toBe(409)
        expect(storage.metadataWrites).toHaveLength(0)
        expect(storage.index).toBeUndefined()
    })

    it('全画像確認後にmetadataを書き、その作品をindexへ追加する', async () => {
        const storage = new MemoryStorage()
        addExpectedImages(storage)

        const response = await createHandler(storage)(event())

        expect(response.statusCode).toBe(200)
        expect(storage.metadataWrites).toEqual([
            {
                key: 'manga/baburios-abc123/metadata.json',
                metadata: {
                    id: 'baburios-abc123',
                    title: 'バブリオス',
                    chapters: [
                        { id: '001', title: '1巻', pages: 2 },
                        { id: '002', title: '2巻', pages: 1 },
                    ],
                    updatedAt: now.toISOString(),
                },
            },
        ])
        expect(storage.index?.works).toHaveLength(1)
        expect(storage.index?.works[0]?.id).toBe('baburios-abc123')
    })

    it('競合時にindexを再読込し、別Lambdaが追加した作品を消さない', async () => {
        const storage = new MemoryStorage()
        addExpectedImages(storage)
        storage.conflictIndex = {
            works: [
                {
                    id: 'another-work',
                    title: '別作品',
                    chapterCount: 1,
                    updatedAt: '2026-09-20T00:00:00.000Z',
                },
            ],
        }

        const response = await createHandler(storage)(event())

        expect(response.statusCode).toBe(200)
        expect(storage.indexWriteAttempts).toBe(2)
        expect(storage.index?.works.map(({ id }) => id)).toEqual([
            'another-work',
            'baburios-abc123',
        ])
    })

    it('同じcomplete requestを再送してもindexで重複しない', async () => {
        const storage = new MemoryStorage()
        addExpectedImages(storage)
        const handler = createHandler(storage)

        expect((await handler(event())).statusCode).toBe(200)
        expect((await handler(event())).statusCode).toBe(200)

        expect(storage.index?.works).toHaveLength(1)
        expect(storage.metadataWrites).toHaveLength(2)
    })
})
