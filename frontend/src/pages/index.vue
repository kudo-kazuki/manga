<script setup lang="ts"></script>

<template>
    <main class="LibraryPage">
        <header>
            <h1>作品一覧</h1>
        </header>
    </main>
</template>

<style scoped lang="scss">
.LibraryPage {
    width: 100%;
    padding: 16px 16px 80px;
    height: 100%;

    &__eyebrow {
        color: #85734c;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
    }

    h1 {
        font-size: 28px;
        font-weight: 700;
    }

    &__works {
        display: grid;
        grid-template-columns: 1fr;
        gap: 20px;
        margin-top: 20px;

        @media (min-width: 767px) {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        @media (min-width: 1200px) {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }
    }

    &__empty {
        color: #6f6a60;
        margin: 0;
    }

    @media (max-width: 767px) {
        h1 {
            font-size: 24px;
        }

        &__works {
            gap: 16px;
            margin-top: 16px;
        }
    }
}
</style>
