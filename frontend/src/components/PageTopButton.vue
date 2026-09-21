<script setup lang="ts">
import arrowUp from '@/assets/images/arrowUp.png'

defineProps<{ visible: boolean }>()
defineEmits<{ click: [] }>()
</script>

<template>
    <Transition name="PageTopButtonFade">
        <button
            v-if="visible"
            type="button"
            class="PageTopButton"
            aria-label="ページトップへ戻る"
            @click="$emit('click')"
        >
            <img class="PageTopButton__icon" :src="arrowUp" alt="" />
        </button>
    </Transition>
</template>

<style scoped lang="scss">
.PageTopButton {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid #d9d6cf;
    border-radius: 50%;
    background-color: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
    transition:
        background-color 0.15s ease,
        border-color 0.15s ease;

    &:hover {
        border-color: #2e4268;
        background-color: #2e4268;

        .PageTopButton__icon {
            filter: brightness(0) invert(1);
        }
    }

    &__icon {
        width: 18px;
        height: 18px;
        transition: filter 0.15s ease;
    }
}

.PageTopButtonFade-enter-active,
.PageTopButtonFade-leave-active {
    transition: opacity 0.2s ease;
}

.PageTopButtonFade-enter-from,
.PageTopButtonFade-leave-to {
    opacity: 0;
}
</style>
