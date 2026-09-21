<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useLoadingStore } from '@/stores/loading'

const store = useLoadingStore()

// 表示用の進捗
const displayProgress = ref(0)
let timer: ReturnType<typeof setTimeout> | null = null

// 実際のロードが終わっても、数字が100%になるまで表示を維持するためのフラグ
const isShowing = computed(() => {
    return store.isLoading || (displayProgress.value > 0 && displayProgress.value < 100)
})

// 目標値（store.progress）を追いかけるロジック
const updateProgress = () => {
    if (timer) clearTimeout(timer)

    const target = store.isLoading ? store.progress : 100
    const diff = target - displayProgress.value

    if (diff > 0) {
        // 残りの距離に応じて増分を変える（最低1、最大は距離の1/5程度）
        // 実際のロードが終わっていたらさらに加速させる
        const speedMultiplier = store.isLoading ? 8 : 4 
        const step = Math.ceil(diff / speedMultiplier)
        
        displayProgress.value += step
        
        // 次の更新
        timer = setTimeout(updateProgress, 16) // ~60fps
    } else {
        displayProgress.value = target
        timer = null
    }
}

// 進捗またはローディング状態の変化を監視
watch([() => store.progress, () => store.isLoading], () => {
    updateProgress()
}, { immediate: true })
</script>

<template>
    <transition name="fade">
        <div v-if="isShowing" class="LoadingOverlay">
            <div class="LoadingOverlay__content">
                <!-- 末尾のドットを削除してから、一文字ずつ分割して表示 -->
                <div class="LoadingOverlay__text">
                    <span 
                        v-for="(char, index) in store.message.replace(/\.*$/, '').split('')" 
                        :key="index"
                        class="LoadingOverlay__char"
                    >
                        {{ char }}
                    </span>
                </div>
                <div class="LoadingOverlay__barContainer">
                    <div 
                        class="LoadingOverlay__bar" 
                        :style="{ width: `${store.progress}%` }"
                    ></div>
                </div>
                <div class="LoadingOverlay__percentage">
                    {{ displayProgress }}%
                </div>
            </div>
        </div>
    </transition>
</template>

<style lang="scss" scoped>
.LoadingOverlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 800000; /* 通常のUIより手前、モーダル(100万)より背面 */

    &__content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        color: var(--premium-accent);
        font-family: inherit; /* monospaceから継承へ変更 */
        font-weight: bold;
    }

    &__spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(174, 157, 78, 0.2); /* 黄金のベース色（薄く） */
        border-top: 4px solid var(--premium-accent); /* 黄金の回転部 */
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    &__text {
        font-size: 25px; /* 28px から 0.9倍に微調整 */
        font-weight: 900;
        letter-spacing: 2px;
        display: flex;
        align-items: center;
        position: relative;
        transform: translateX(-2px); /* 視覚的バランスのため2px左へ微調整 */

        /* 一文字ずつの交互の色設定（落ち着いた重厚なトーンに調整） */
        span {
            &:nth-child(odd) {
                color: var(--premium-accent);  /* 標準的な黄金 */
            }
            &:nth-child(even) {
                color: rgba(174, 157, 78, 0.7); /* 重厚な暗い黄金 */
            }
        }

        /* ドット部分のアニメーション設定 */
        &::after {
            content: '';
            position: absolute; /* 絶対配置にして親の幅に影響を与えない */
            left: 100%;         /* 単語のすぐ右側に配置 */
            margin-left: 4px;   /* 文字との隙間 */
            display: inline-block;
            width: 1.5em;
            text-align: left;
            font-size: 22px;    /* 18px から 1.2倍に微調整 */
            font-weight: bold;  /* 太すぎず、存在感を抑える */
            animation: loadingDots 2s infinite;
        }
    }

    &__barContainer {
        width: 240px;
        height: 6px;
        background: rgba(174, 157, 78, 0.2);
        border-radius: 3px;
        overflow: hidden;
    }

    &__bar {
        height: 100%;
        background: rgba(202, 185, 102, 1); /* 少し明るめの黄金色 */
        transition: width 0.2s ease-out;
    }

    &__percentage {
        font-size: 22px; /* 18px から 1.2倍へ拡大 */
        font-weight: 900; /* クッキリとした最高強度の太字 */
        color: rgba(174, 157, 78, 0.8); /* 少し暗めの黄金で統一 */
        opacity: 0.9;
        transform: translateX(2px); /* 視覚的バランスのため2px右へ微調整 */
    }
}

@keyframes loadingDots {
    0% { content: ''; }
    25% { content: '.'; }
    50% { content: '..'; }
    75% { content: '...'; }
    100% { content: ''; }
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
