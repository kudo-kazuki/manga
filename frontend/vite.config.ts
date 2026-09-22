import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { defineConfig, loadEnv } from 'vite'
import Pages from 'vite-plugin-pages'

export default defineConfig(({ mode }) => {
    // Local browserでもdeploy済みの認証/API/漫画配信を同一origin風に確認できるよう、
    // Git管理しない.env.localのCloudFront URLへAPIとprivate pathだけをproxyする。
    const { MANGA_DEV_PROXY_TARGET: proxyTarget } = loadEnv(
        mode,
        process.cwd(),
        'MANGA_',
    )

    return {
        plugins: [
            vue(),
            Pages({
                dirs: 'src/pages',
                extensions: ['vue'],
            }),
            Components({
                dirs: ['src/components'],
                extensions: ['vue'],
                deep: true,
                dts: 'src/components.d.ts',
                resolvers: [ElementPlusResolver()],
            }),
            AutoImport({
                imports: ['vue', 'vue-router'],
                dts: 'src/auto-imports.d.ts',
                resolvers: [ElementPlusResolver()],
            }),
        ],
        server: {
            host: '0.0.0.0',
            port: 4646,
            strictPort: true,
            ...(proxyTarget
                ? {
                      proxy: {
                          '/api': {
                              target: proxyTarget,
                              changeOrigin: true,
                          },
                          '/manga': {
                              target: proxyTarget,
                              changeOrigin: true,
                          },
                      },
                  }
                : {}),
        },
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
        css: {
            preprocessorOptions: {
                scss: {
                    additionalData: `
                    @use "@/scss/variables.scss" as var;
                    @use "@/scss/mixins.scss" as mixin;
                `,
                },
            },
        },
        assetsInclude: ['**/*.mp3', '**/*.wav'],
    }
})
