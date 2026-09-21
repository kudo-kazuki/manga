<script setup lang="ts">
interface Props {
    modelValue: boolean
    text?: string
    isDisabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: false,
    isDisabled: false,
})

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
}>()

const onChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    emit('update:modelValue', target.checked)
}
</script>

<template>
    <label class="CheckBox" :class="{ 'CheckBox--disabled': isDisabled }">
        <input
            type="checkbox"
            class="CheckBox__input"
            :checked="modelValue"
            :disabled="isDisabled"
            @change="onChange"
        />
        <span v-if="text" class="CheckBox__text">{{ text }}</span>
    </label>
</template>

<style lang="scss" scoped>
.CheckBox {
    display: inline-flex;
    align-items: center;
    column-gap: 4px;
    cursor: pointer;

    &__input {
        $size: 18px;
        width: $size;
        height: $size;
    }

    &--disabled &__input {
        pointer-events: none;
        cursor: not-allowed;
    }

    &--disabled &__text {
        color: #999;
    }
}
</style>
