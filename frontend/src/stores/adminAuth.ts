import { defineStore } from 'pinia'
import type { LoginResult } from './auth'

export const useAdminAuthStore = defineStore('admin-auth', () => {
    const checkSession = async (): Promise<boolean> => {
        try {
            const response = await fetch('/api/admin/session', {
                credentials: 'include',
            })
            return response.ok
        } catch {
            return false
        }
    }

    const login = async (password: string): Promise<LoginResult> => {
        try {
            // 管理passwordもstoreやlocalStorageへ保存せず、その場でAPIへ送るだけにする。
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ password }),
            })
            if (response.ok) return 'success'
            if (response.status === 401) return 'invalid-credentials'
            return 'network-error'
        } catch {
            return 'network-error'
        }
    }

    const logout = async (): Promise<void> => {
        try {
            await fetch('/api/admin/logout', {
                method: 'POST',
                credentials: 'include',
            })
        } catch {
            // HttpOnly CookieはJSから消せないため、画面遷移後に再度logoutを試せる状態にする。
        }
    }

    return { checkSession, login, logout }
})
