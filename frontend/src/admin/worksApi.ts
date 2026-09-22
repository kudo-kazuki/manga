import { AdminAuthenticationError } from '@/upload/uploadApi'

export interface AdminWorkEntry {
    readonly id: string
    readonly title: string
    readonly chapterCount: number
    readonly updatedAt: string
}

interface AdminWorksResponse {
    readonly ok: true
    readonly works: readonly AdminWorkEntry[]
}

export async function loadAdminWorks(): Promise<readonly AdminWorkEntry[]> {
    const response = await fetch('/api/admin/works', {
        credentials: 'include',
    })
    if (response.status === 401 || response.status === 403) {
        throw new AdminAuthenticationError('管理セッションが切れました。')
    }
    if (!response.ok) throw new Error('作品一覧の取得に失敗しました。')
    return ((await response.json()) as AdminWorksResponse).works
}

export async function deleteAdminWork(workId: string): Promise<void> {
    const response = await fetch(
        `/api/admin/works/${encodeURIComponent(workId)}`,
        {
            method: 'DELETE',
            credentials: 'include',
        },
    )
    if (response.status === 401 || response.status === 403) {
        throw new AdminAuthenticationError('管理セッションが切れました。')
    }
    if (!response.ok) throw new Error('作品の削除に失敗しました。')
}
