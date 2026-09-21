<script setup lang="ts">
interface Props {
    text?: string
    isOverlay?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    isOverlay: true,
})
</script>

<template>
    <div class="Loading" :class="{ 'Loading--overlay': isOverlay }">
        <div class="Loading__loader"></div>
        <span v-if="text" class="Loading__text">{{ text }}</span>
    </div>
</template>

<style lang="scss" scoped>
.Loading {
    &--overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999999;
        background-color: rgba(255, 255, 255, 0.5);
    }

    &__loader {
        width: 50px;
        padding: 8px;
        aspect-ratio: 1;
        border-radius: 50%;
        background: #25b09b;
        --_m:
            conic-gradient(#0000 10%, #000),
            linear-gradient(#000 0 0) content-box;
        -webkit-mask: var(--_m);
        mask: var(--_m);
        -webkit-mask-composite: source-out;
        mask-composite: subtract;
        animation: l3 1s infinite linear;
    }
    @keyframes l3 {
        to {
            transform: rotate(1turn);
        }
    }

    &__text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-shadow:
            1px 1px 1px #fff,
            -1px -1px 1px #fff;
        font-size: 20px;
        z-index: 999999;
    }
}
</style>
