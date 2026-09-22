import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { describe, expect, it } from 'vitest'
import {
    createAdminWorksHandler,
    IndexWriteConflictError,
    type AdminWorksStorage,
} from '../functions/admin-works.js'
import {
    ADMIN_COOKIE_NAME,
    createAdminSessionCookie,
    readCookie,
} from '../shared/admin-session.js'
import type { MangaIndex } from '../shared/metadata.js'
import type { ParameterReader } from '../shared/parameters.js'

const signingKey = 'admin-works-signing-key-with-enough-randomness'
const signingKeyParameterName = '/manga/admin-signing-key'
const now = Date.parse('2026-09-22T00:00:00.000Z')

const initialIndex: MangaIndex = {
    works: [
        {
            id: 'sample-one',
            title: 'サンプル1',
            chapterCount: 2,
            updatedAt: '2026-09-21T00:00:00.000Z',
        },
        {
            id: 'keep-this',
            title: '残す作品',
            chapterCount: 1,
            updatedAt: '2026-09-20T00:00:00.000Z',
        },
    ],
}

class MemoryStorage implements AdminWorksStorage {
    public index: MangaIndex | undefined = initialIndex
    public eTag = 'etag-1'
    public readonly objectKeys = Array.from(
        { length: 1_001 },
        (_, index) => `manga/sample-one/001/${index + 1}.webp`,
    )
    public readonly deleteBatches: string[][] = []
    public conflictOnce = false

    public async readIndex() {
        return this.index
            ? { body: JSON.stringify(this.index), eTag: this.eTag }
            : undefined
    }

    public async listObjectKeys(prefix: string): Promise<readonly string[]> {
        return this.objectKeys.filter((key) => key.startsWith(prefix))
    }

    public async deleteObjects(keys: readonly string[]): Promise<void> {
        this.deleteBatches.push([...keys])
    }

    public async writeIndex(
        index: MangaIndex,
        expectedETag: string,
    ): Promise<void> {
        if (this.conflictOnce) {
            this.conflictOnce = false
            this.eTag = 'etag-concurrent'
            throw new IndexWriteConflictError()
        }
        if (expectedETag !== this.eTag) throw new IndexWriteConflictError()
        this.index = index
        this.eTag = 'etag-next'
    }
}

const parameters: ParameterReader = {
    async getSecureString(name) {
        if (name !== signingKeyParameterName) throw new Error('unexpected')
        return signingKey
    },
}

function event(
    method: 'GET' | 'DELETE',
    workId?: string,
    authenticated = true,
): APIGatewayProxyEventV2 {
    const cookieHeader = createAdminSessionCookie(
        signingKey,
        Math.floor(now / 1000) + 60,
    )
    const cookieValue = readCookie([cookieHeader], ADMIN_COOKIE_NAME)
    return {
        version: '2.0',
        routeKey:
            method === 'GET'
                ? 'GET /api/admin/works'
                : 'DELETE /api/admin/works/{workId}',
        rawPath:
            method === 'GET'
                ? '/api/admin/works'
                : `/api/admin/works/${workId ?? ''}`,
        rawQueryString: '',
        headers: {},
        requestContext: {
            http: { method },
        } as APIGatewayProxyEventV2['requestContext'],
        isBase64Encoded: false,
        ...(workId ? { pathParameters: { workId } } : {}),
        ...(authenticated && cookieValue
            ? { cookies: [`${ADMIN_COOKIE_NAME}=${cookieValue}`] }
            : {}),
    }
}

function handler(storage: MemoryStorage, invalidatedWorkIds: string[] = []) {
    return createAdminWorksHandler({
        adminSigningKeyParameterName: signingKeyParameterName,
        parameters,
        storage,
        async invalidateCache(workId) {
            invalidatedWorkIds.push(workId)
        },
        now: () => now,
    })
}

describe('Admin works handler', () => {
    it('管理sessionがなければ一覧も削除も拒否する', async () => {
        const storage = new MemoryStorage()
        await expect(
            handler(storage)(event('GET', undefined, false)),
        ).resolves.toMatchObject({
            statusCode: 401,
        })
        await expect(
            handler(storage)(event('DELETE', 'sample-one', false)),
        ).resolves.toMatchObject({
            statusCode: 401,
        })
        expect(storage.deleteBatches).toHaveLength(0)
    })

    it('公開indexの作品一覧を管理画面へ返す', async () => {
        const response = await handler(new MemoryStorage())(event('GET'))

        expect(response.statusCode).toBe(200)
        expect(JSON.parse(response.body ?? '{}').works).toEqual(
            initialIndex.works,
        )
    })

    it('作品objectを1000件ずつ削除してindexから対象だけを外す', async () => {
        const storage = new MemoryStorage()
        const invalidatedWorkIds: string[] = []
        const response = await handler(
            storage,
            invalidatedWorkIds,
        )(event('DELETE', 'sample-one'))

        expect(response.statusCode).toBe(200)
        expect(storage.deleteBatches.map((batch) => batch.length)).toEqual([
            1_000, 1,
        ])
        expect(storage.index?.works.map(({ id }) => id)).toEqual(['keep-this'])
        expect(invalidatedWorkIds).toEqual(['sample-one'])
    })

    it('不正workIdを拒否し、存在しない作品の再削除は成功扱いにする', async () => {
        const storage = new MemoryStorage()
        const invalidatedWorkIds: string[] = []
        await expect(
            handler(storage)(event('DELETE', '../secret')),
        ).resolves.toMatchObject({ statusCode: 400 })
        await expect(
            handler(storage, invalidatedWorkIds)(
                event('DELETE', 'not-found'),
            ),
        ).resolves.toMatchObject({ statusCode: 200 })
        expect(storage.deleteBatches).toHaveLength(0)
        expect(invalidatedWorkIds).toEqual(['not-found'])
    })

    it('index競合時は再読込して削除を完了する', async () => {
        const storage = new MemoryStorage()
        storage.conflictOnce = true

        const response = await handler(storage)(event('DELETE', 'sample-one'))

        expect(response.statusCode).toBe(200)
        expect(storage.index?.works.map(({ id }) => id)).toEqual(['keep-this'])
    })
})
