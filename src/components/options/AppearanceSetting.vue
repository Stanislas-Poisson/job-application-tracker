<script setup lang="ts">
  import { FormSelect } from '@zairakai/vue-components/Form'
  import { computed } from 'vue'
  import { ACCENT_SWATCHES } from '../../appearance'
  import { useApp } from '../../composables/useApp'
  import { ACCENTS, type Accent, THEMES, type ThemeMode, VISIONS, type Vision } from '../../settings'

  const { t, settings, updateSettings } = useApp()

  const themeOptions = computed(() =>
    Object.fromEntries(THEMES.map((theme) => [theme, t(`appearance.themes.${theme}`)]))
  )
  const visionOptions = computed(() =>
    Object.fromEntries(VISIONS.map((vision) => [vision, t(`appearance.visions.${vision}`)]))
  )
</script>

<template>
  <h2>{{ t('appearance.title') }}</h2>
  <div class="stack">
    <FormSelect
      :model-value="settings.theme"
      name="theme"
      :label="t('appearance.theme')"
      :options="themeOptions"
      @update:model-value="updateSettings({ theme: String($event) as ThemeMode })"
    />

    <div class="field">
      <span
        id="accent-label"
        class="label"
        >{{ t('appearance.accent') }}</span
      >
      <div
        class="swatches"
        role="radiogroup"
        aria-labelledby="accent-label"
      >
        <button
          v-for="accent in ACCENTS"
          :key="accent"
          type="button"
          class="swatch"
          role="radio"
          :aria-checked="settings.accent === accent"
          :aria-label="t(`appearance.accents.${accent}`)"
          :title="t(`appearance.accents.${accent}`)"
          :data-accent-choice="accent"
          :style="{ '--swatch': ACCENT_SWATCHES[accent as Accent] }"
          @click="updateSettings({ accent })"
        >
          <span
            v-if="settings.accent === accent"
            aria-hidden="true"
            >&#10003;</span
          >
        </button>
      </div>
    </div>

    <FormSelect
      :model-value="settings.vision"
      name="vision"
      :label="t('appearance.vision')"
      :options="visionOptions"
      @update:model-value="updateSettings({ vision: String($event) as Vision })"
    />
    <p class="muted">{{ t('appearance.visionHint') }}</p>
  </div>
</template>

<style lang="scss">
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    font-size: 1rem;
    color: #fff;
    background: var(--swatch);
    border: 2px solid transparent;
    border-radius: 50%;

    &[aria-checked='true'] {
      border-color: var(--on-surface);
      outline: 2px solid var(--swatch);
      outline-offset: 2px;
    }
  }
</style>
