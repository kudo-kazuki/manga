import { defineStore } from 'pinia'

export type LoginResult = 'success' | 'invalid-credentials' | 'network-error'

export const useAuthStore = defineStore('auth', () => {
    const login = async (password: string): Promise<LoginResult> => {
        try {
            // APIはCloudFrontと同一originの相対URLを使う。passwordはstoreへ保持しない。
            const response = await fetch('/api/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ password }),
            })

            // 401だけは利用者が修正できる入力エラーとして画面に分けて表示する。
            if (response.ok) return 'success'
            if (response.status === 401) return 'invalid-credentials'
            return 'network-error'
        } catch {
            return 'network-error'
        }
    }

    const logout = async (): Promise<void> => {
        try {
            await fetch('/api/logout', {
                method: 'POST',
                credentials: 'include',
            })
        } catch {
            // CookieはHttpOnlyなのでFrontendから直接消せない。
            // 通信失敗でも呼び出し元はlogin画面へ戻し、再試行できる状態にする。
        }
    }

    return { login, logout }
})
