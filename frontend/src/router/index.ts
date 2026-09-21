import { createRouter, createWebHistory } from 'vue-router'
import routes from 'virtual:generated-pages'

// history modeの直リンクはCloudFront Functionでindex.htmlへ書き換える。
// /api/*と/manga/*は書き換え対象外なので、認証エラーやAPIエラーをSPAの200で隠さない。
const router = createRouter({
    history: createWebHistory(),
    routes: [...routes],
})

export default router
