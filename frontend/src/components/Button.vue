<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

interface Props {
    text?: string
    color?: 'blue' | 'black' | 'gray' | 'red' | 'orange' | 'navy'
    size?: 'l' | 'm' | 's'
    isActive?: boolean
    isDisabled?: boolean
    icon?: string
    to?: RouteLocationRaw
    nativeType?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
    color: 'black',
    size: 's',
    nativeType: 'button',
})
</script>

<template>
    <router-link
        v-if="to && !isDisabled"
        class="Button"
        :class="[
            `Button--${color}`,
            `Button--${size}`,
            { 'Button--active': isActive, 'Button--disabled': isDisabled },
        ]"
        :to="to"
    >
        <img v-if="icon" class="Button__icon" :src="icon" alt="" />
        <slot>{{ text }}</slot>
    </router-link>
    <button
        v-else
        :type="nativeType"
        class="Button"
        :class="[
            `Button--${color}`,
            `Button--${size}`,
            { 'Button--active': isActive, 'Button--disabled': isDisabled },
        ]"
        :disabled="isDisabled"
    >
        <img v-if="icon" class="Button__icon" :src="icon" alt="" />
        <slot>{{ text }}</slot>
    </button>
</template>

<style lang="scss" scoped>
@use 'sass:map';
@use '../scss/mixins' as *;
$size-styles: (
    'l': (
        'font-size': 28px,
        'padding': 8px 24px,
    ),
    'm': (
        'font-size': 20px,
        'padding': 12px 20px,
    ),
    's': (
        'font-size': 14px,
        'padding': 8px 12px,
    ),
);

$color-styles: (
    'blue': (
        'color': #fff,
        'background-color': #1542d5,
        'hover-color': #fff,
        'hover-background-color': #1a45d4,
    ),
    'black': (
        'color': #fff,
        'background-color': #111,
        'hover-color': #fff,
        'hover-background-color': #111,
    ),
    'gray': (
        'color': #111,
        'background-color': #eee,
        'hover-color': #fff,
        'hover-background-color': #bbb,
    ),
    'red': (
        'color': #fff,
        'background-color': #c11d1d,
        'hover-color': #fff,
        'hover-background-color': #c11d1d,
    ),
    'orange': (
        'color': #fff,
        'background-color': #e97911,
        'hover-color': #fff,
        'hover-background-color': #ee8019,
    ),
    'navy': (
        'color': #fff,
        'background-color': #2e4268,
        'hover-color': #fff,
        'hover-background-color': #3b527e,
    ),
);

.Button {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    color: #fff;
    padding: 8px 12px;
    font-size: 14px;
    border-radius: 28px;
    border: none;
    cursor: pointer;
    font-weight: bold;
    box-shadow: 1px 1px 4px rgba(0, 0, 0, 0.4);
    text-decoration: none;
    &:not(&--disabled):hover {
        color: #fff;
    }

    &.is-premium-theme {
        border: 2.5px solid var(--premium-accent) !important;
        box-shadow: 0 0 0 3px #000 !important;
        background: var(--premium-bg-dark);
        color: var(--premium-primary);

        &:hover:not(.is-disabled) {
            background: var(--premium-primary) !important;
            color: var(--premium-bg-dark) !important;
            box-shadow: 0 0 0 3px #000 !important;
        }
    }

    &--disabled {
        color: #aaa !important;
        background-color: #efefef !important;
        box-shadow: none !important;

        &.is-premium-theme {
            background-color: #333 !important;
            border-color: #555 !important;
            color: #777 !important;
            filter: grayscale(1);
        }
    }

    @each $size, $style in $size-styles {
        &--#{$size} {
            font-size: map.get($style, 'font-size');
            padding: map.get($style, 'padding');
        }
    }

    @each $color, $style in $color-styles {
        &--#{$color} {
            color: map.get($style, 'color');
            background-color: map.get($style, 'background-color');

            &:hover {
                color: map.get($style, 'hover-color');
                background-color: map.get($style, 'hover-background-color');
            }
        }
    }

    &__icon {
        width: 24px;
        height: 24px;
        margin-right: 8px;
    }
}
</style>
