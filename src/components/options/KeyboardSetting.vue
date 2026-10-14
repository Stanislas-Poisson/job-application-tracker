<script setup lang="ts">
  import { useApp } from '../../composables/useApp'

  const { t, settings, updateSettings } = useApp()
</script>

<template>
  <h2>{{ t('keyboard.title') }}</h2>
  <div class="stack">
    <label class="row">
      <input
        type="checkbox"
        name="shortcuts"
        :checked="settings.shortcuts"
        @change="updateSettings({ shortcuts: ($event.target as HTMLInputElement).checked })"
      />
      {{ t('keyboard.enable') }}
    </label>
    <p class="muted">{{ t('keyboard.hint') }}</p>
    <dl class="shortcuts">
      <div>
        <dt><kbd>/</kbd></dt>
        <dd>{{ t('keyboard.search') }}</dd>
      </div>
      <div>
        <dt><kbd>&uarr;</kbd> <kbd>&darr;</kbd> <kbd>&larr;</kbd> <kbd>&rarr;</kbd></dt>
        <dd>{{ t('keyboard.cards') }}</dd>
      </div>
      <div>
        <dt><kbd>Shift</kbd> + <kbd>&larr;</kbd> <kbd>&rarr;</kbd></dt>
        <dd>{{ t('keyboard.move') }}</dd>
      </div>
    </dl>
    <p class="muted">{{ t('keyboard.browser') }}</p>
  </div>
</template>

<style lang="scss">
  .shortcuts {
    display: grid;
    gap: 0.4rem;
    margin: 0;

    > div {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem 0.8rem;
      align-items: baseline;
    }

    dt {
      min-inline-size: 9rem;
    }

    dd {
      margin: 0;
    }

    kbd {
      padding: 0.05rem 0.4rem;
      font: inherit;
      font-size: 0.85em;
      background: var(--surface);
      border: 1px solid var(--zk-border-strong);
      border-radius: 4px;
    }
  }
</style>
