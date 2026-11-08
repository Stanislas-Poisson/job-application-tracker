<script setup lang="ts">
  import { useApp } from '../composables/useApp'

  const { t } = useApp()

  // The browser jumps to the anchor, but the focus stays where it was on some of them: the page takes it itself.
  function skip() {
    const main = document.getElementById('main')
    main?.focus()
    main?.scrollIntoView()
  }
</script>

<template>
  <a
    class="skip-link"
    href="#main"
    @click.prevent="skip"
    >{{ t('a11y.skip') }}</a
  >
</template>

<style lang="scss">
  // Out of the page until the keyboard reaches it: the first stop of every page, to go past the header.
  .skip-link {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    z-index: 1000;
    padding: 0.5rem 0.9rem;
    color: var(--on-primary);
    background: var(--primary);
    border-end-end-radius: var(--zk-radius);
    transform: translateY(-120%);

    &:focus {
      transform: none;
    }
  }
</style>
