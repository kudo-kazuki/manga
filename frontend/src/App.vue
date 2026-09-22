<script setup lang="ts">
import { nextTick, provide, readonly, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { ScrollbarInstance } from 'element-plus'
import { appScrollStateKey } from '@/composables/appScrollState'
import { useElScrollbarScroll } from '@/composables/useElScrollbarScroll'
import { useWindowSizeAndDevice } from '@/composables/useWindowSizeAndDevice'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
// 管理画面は独立したheaderを持つため、閲覧側のheaderとlogoutを重ねない。
const isStandalonePage = computed(
    () =>
        route.path === '/login' ||
        route.path.startsWith('/admin') ||
        route.path.startsWith('/local'),
)
const scrollbar = ref<ScrollbarInstance | null>(null)
const { height, deviceType } = useWindowSizeAndDevice()
const { showScrollButton, currentTop, isScrollable, onScroll, goToPageTop } =
    useElScrollbarScroll(scrollbar, {
        threshold: 0,
    })
const materialListScrollPositions = new Map<string, number>()

const getMaterialListWorkId = (path: string) =>
    path.match(/^\/works\/([^/]+)\/materials\/?$/)?.[1]

const getMaterialDetailWorkId = (path: string) =>
    path.match(/^\/works\/([^/]+)\/materials\/[^/]+\/?$/)?.[1]

const logout = async () => {
    await authStore.logout()
    await router.replace('/login')
}

provide(appScrollStateKey, readonly(isScrollable))

watch(
    () => route.fullPath,
    async (toPath, fromPath) => {
        const previousWorkId = getMaterialListWorkId(fromPath)
        if (previousWorkId) {
            materialListScrollPositions.set(previousWorkId, currentTop.value)
        }

        await nextTick()

        const materialListWorkId = getMaterialListWorkId(toPath)
        const previousMaterialWorkId = getMaterialDetailWorkId(fromPath)
        const scrollTop =
            materialListWorkId && materialListWorkId === previousMaterialWorkId
                ? (materialListScrollPositions.get(materialListWorkId) ?? 0)
                : 0

        scrollbar.value?.setScrollTop(scrollTop)
        currentTop.value = scrollTop
    },
)
</script>

<template>
    <div
        class="App"
        :style="{ height: `${height}px` }"
        :data-device="deviceType"
    >
        <header v-if="!isStandalonePage" class="AppHeader">
            <router-link
                class="AppHeader__home"
                to="/"
                aria-label="作品一覧へ戻る"
            >
                <img src="@/assets/images/fire.gif" alt="" />
                <span>漫画</span>
            </router-link>

            <button class="AppHeader__logout" type="button" @click="logout">
                ログアウト
            </button>
        </header>

        <div class="App__content">
            <el-scrollbar ref="scrollbar" height="100%" @scroll="onScroll">
                <router-view />
            </el-scrollbar>
        </div>

        <PageTopButton
            v-if="!isStandalonePage"
            :visible="showScrollButton"
            @click="goToPageTop"
        />
    </div>
</template>

<style scoped lang="scss">
.App {
    display: flex;
    flex-direction: column;
    overflow: hidden;

    &__content {
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    :deep(.el-scrollbar__view) {
        min-height: 100%;
    }
}

.AppHeader {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    padding: 0 14px;
    border-bottom: 1px solid #e4e1da;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(8px);

    &__home {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        color: #302e2a;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-decoration: none;
    }

    &__logout {
        padding: 4px 9px;
        border: 1px solid #d8d4cc;
        border-radius: 12px;
        background: #fff;
        color: #716d65;
        font-size: 11px;
        line-height: 1.2;
        cursor: pointer;
        transition:
            color 0.2s ease,
            border-color 0.2s ease,
            background-color 0.2s ease;

        &:hover {
            border-color: #bcb6aa;
            background: #f5f3ee;
            color: #302e2a;
        }
    }

    img {
        width: 22px;
        height: 22px;
        border-radius: 5px;
    }
}
</style>
