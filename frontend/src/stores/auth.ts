import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
    const login = async (_username: string, _password: string) => {
        // Phase 1はSPAの配信確認だけを行う。Phase 2でPOST /api/loginへ置き換える。
        // 仮の認証成功を返すと保護済みと誤認するため、実装前は必ず失敗扱いにする。
        return false
    }

    const logout = () => {
        // Phase 2でSigned Cookieを失効させるPOST /api/logoutへ置き換える。
    }

    return { login, logout }
})
