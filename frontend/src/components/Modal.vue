<script setup lang="ts">
interface Props {
    title: string
    size?: 'full' | 'l' | 'm' | 's'
    isTextCenter?: boolean
    isShow?: boolean
    innerClass?: string
    zIndex?: number
    isScrollbarAlways?: boolean
    showFooterDivider?: boolean
    footerPadding?: string
}

const props = withDefaults(defineProps<Props>(), {
    size: 'l',
    innerClass: '',
    zIndex: 1000000,
    isScrollbarAlways: false,
    showFooterDivider: false,
    footerPadding: '12px 24px 16px',
})

const emit = defineEmits(['close'])

const close = () => {
    emit('close', false)
}
</script>

<template>
    <teleport to="body">
        <transition name="pop">
            <section v-if="isShow" class="Modal" :class="[`Modal--${size}`]" :style="{ zIndex: zIndex }">
                <div class="Modal__overlay" @click="close()"></div>
                <div class="Modal__inner" :class="[innerClass, { 'premium-window': innerClass.includes('is-premium-theme') }]">
                    <header class="Modal__header">
                        <h1>{{ title }}</h1>
                        <button class="Modal__closeButton" @click="close()">
                            ×
                        </button>
                    </header>
                    <main
                        class="Modal__body"
                        :class="{ 
                            'Modal__body--textCenter': isTextCenter,
                            'Modal__body--hasDivider': showFooterDivider 
                        }"
                    >
                        <div v-if="$slots['body-fixed']" class="Modal__bodyFixed">
                            <slot name="body-fixed" />
                        </div>
                        <el-scrollbar :always="isScrollbarAlways">
                            <div class="Modal__bodyInner">
                                <slot name="body" />
                            </div>
                        </el-scrollbar>
                    </main>
                    <footer class="Modal__footer" :style="{ padding: footerPadding }">
                        <slot name="footer">
                            <Button
                                text="閉じる"
                                color="gray"
                                @click="close()"
                            />
                        </slot>
                    </footer>
                </div>
            </section>
        </transition>
    </teleport>
</template>

<style lang="scss" scoped>
@use '../scss/mixins' as *;
.Modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 24px;
    z-index: 1000000; /* 100万: スキル等より手前、チャット入力(200万)より背面 */
    justify-content: center;
    align-items: center;

    &__overlay {
        position: fixed;
        top: 0;
        left: 0;
        background-color: rgba(0, 0, 0, 0.6);
        width: 100%;
        height: 100%;
        cursor: pointer;
    }

    &__inner {
        position: relative;
        // height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background-color: #fff;
        border-radius: 10px;
        box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
        word-break: break-all;

        &.is-premium-theme {
            background-image: none;

            .Modal__header {
                border-bottom: none; /* 直接のボーダーを消す */
                position: relative;

                .Modal__subtitle {
                    font-size: 14px;
                    color: var(--premium-accent);
                    margin-top: 4px;
                    margin-bottom: 8px;
                    text-align: center;
                    opacity: 0.9;
                    letter-spacing: 0.05em;
                }

                &::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 20px; /* 左の隙間 */
                    right: 20px; /* 右の隙間 */
                    height: 1px;
                    background-color: var(--premium-primary-dark);
                }

                h1 {
                    color: var(--premium-primary);
                }
            }

            .Modal__body {
                color: var(--premium-text);
            }

            .Modal__closeButton {
                color: var(--premium-accent);
                background: var(--premium-bg-dark);
                border-radius: 50%; /* 正円に戻す */
                width: 40px; /* コピーボタンと同じサイズ感 */
                height: 40px;
                border: 2.5px solid var(--premium-accent); /* 太さを統一 (2px -> 2.5px) */
                box-shadow: 0 0 0 3px #000; /* 黒縁を強化 (2px -> 3px) */
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                font-size: 24px;
                line-height: 1;
                font-weight: bold;
                transition: all 0.2s ease;
                top: 50%;
                right: 12px;
                transform: translateY(-50%);

                &:hover {
                    background: var(--premium-primary);
                    color: var(--premium-bg-dark);
                    box-shadow: 0 0 0 2px #000;
                    border-color: var(--premium-primary);
                }
            }

            .Modal__body {
                position: relative;
                display: flex;
                flex-direction: column;

                .Modal__bodyFixed {
                    padding: 4px 24px 0;
                    flex-shrink: 0;
                }

                &.Modal__body--hasDivider::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 20px;
                    right: 20px;
                    border-bottom: 1px solid var(--premium-primary-dark);
                    height: 0;
                    z-index: 10;
                }
            }

            .Modal__footer {
                position: relative;
                display: flex;
                justify-content: center;
            }
        }
    }

    &--full &__inner {
        width: 100%;
    }

    &--l &__inner {
        width: 800px;
    }

    &--m &__inner {
        width: 500px;
    }

    &--s &__inner {
        width: 300px;
    }

    &__header {
        position: relative;
        text-align: center;
        padding: 12px 24px;
        border-bottom: 1px solid #ccc;
        user-select: none;

        h1 {
            font-size: 24px;
            line-height: 1.4;
            color: #111;
        }
    }

    &__closeButton {
        position: absolute;
        top: 50%;
        right: 24px;
        transform: translateY(-50%);
        background-color: #333;
        border: 1px solid #333;
        color: #fff;
        border-radius: 50%;
        transition:
            background-color 0.2s ease,
            color 0.2s ease,
            transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        font-size: 16px;
        cursor: pointer;
        $size: 28px;
        width: $size;
        height: $size;

        &:hover {
            background-color: #fff;
            color: #333;
        }
    }

    &__body {
        height: 100%;
        overflow-y: auto;
        padding: 24px 12px;
        color: #111;

        &--textCenter {
            text-align: center;
        }
    }

    &__bodyInner {
        padding: 4px 12px;
    }

    &__footer {
        display: flex;
        justify-content: center;
        padding: 12px 24px 16px;
        user-select: none;

        :deep(ul) {
            display: flex;
            column-gap: 16px;

            .Button {
                width: 112px;
            }
        }
    }

    @media (max-width: 840px) {
        &--l &__inner {
            width: 100%;
        }
    }

    @media (max-width: 600px) {
        padding: 12px;

        &--m &__inner {
            width: 100%;
        }

        &__body {
            padding: 16px 4px;
        }

        &__header {
            padding: 12px;

            h1 {
                font-size: 18px;
            }
        }

        &__closeButton {
            right: 12px;
        }
    }

    @media (max-width: 400px) {
        &--s &__inner {
            width: 100%;
        }
    }
}

.pop-enter-active {
    transition: opacity 0.3s ease;
    .Modal__inner {
        transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
}

.pop-leave-active {
    transition: none !important; /* 瞬時に消す */
    .Modal__inner {
        transition: none !important;
    }
}

.pop-enter-from {
    opacity: 0;
    .Modal__inner {
        transform: scale(0.85);
    }
}

.pop-leave-to {
    /* 透過させずにスケール変化のみで消す */
    .Modal__inner {
        transform: scale(0.9);
    }
}

.pop-enter-to,
.pop-leave-from {
    opacity: 1;

    .Modal__inner {
        transform: scale(1);
    }
}
</style>
