<script setup lang="ts">
  import { FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { computed } from 'vue'
  import { ACCENT_SWATCHES } from '../../appearance'
  import { useApp } from '../../composables/useApp'
  import {
    ACCENTS,
    type Accent,
    DENSITIES,
    type Density,
    FONT_FAMILIES,
    type FontFamily,
    MOTIONS,
    type Motion,
    TEXT_SCALES,
    TEXT_SPACINGS,
    THEMES,
    type TextSpacing,
    type ThemeMode,
    VISIONS,
    type Vision,
  } from '../../settings'
  import ThemeEditor from './ThemeEditor.vue'

  const { t, settings, updateSettings } = useApp()

  const themeOptions = computed(() =>
    Object.fromEntries(THEMES.map((theme) => [theme, t(`appearance.themes.${theme}`)]))
  )
  const visionOptions = computed(() =>
    Object.fromEntries(VISIONS.map((vision) => [vision, t(`appearance.visions.${vision}`)]))
  )
  const choices = (group: string, values: readonly string[]) =>
    computed(() => Object.fromEntries(values.map((value) => [value, t(`appearance.${group}.${value}`)])))
  const fontOptions = choices('fonts', FONT_FAMILIES)
  const spacingOptions = choices('spacings', TEXT_SPACINGS)
  const densityOptions = choices('densities', DENSITIES)
  const motionOptions = choices('motions', MOTIONS)
  const scaleOptions = Object.fromEntries(TEXT_SCALES.map((scale) => [String(scale), `${String(scale)} %`]))
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

    <ThemeEditor />

    <h3>{{ t('appearance.textTitle') }}</h3>
    <FormSelect
      :model-value="settings.fontFamily"
      name="fontFamily"
      :label="t('appearance.font')"
      :options="fontOptions"
      @update:model-value="updateSettings({ fontFamily: String($event) as FontFamily })"
    />
    <FormInput
      v-if="'custom' === settings.fontFamily"
      :model-value="settings.fontCustom"
      name="fontCustom"
      :label="t('appearance.fontCustom')"
      :placeholder="t('appearance.fontCustomHint')"
      @update:model-value="updateSettings({ fontCustom: String($event) })"
    />
    <p class="muted">{{ t('appearance.fontHint') }}</p>
    <FormSelect
      :model-value="String(settings.textScale)"
      name="textScale"
      :label="t('appearance.textScale')"
      :options="scaleOptions"
      @update:model-value="updateSettings({ textScale: Number($event) })"
    />
    <FormSelect
      :model-value="settings.textSpacing"
      name="textSpacing"
      :label="t('appearance.textSpacing')"
      :options="spacingOptions"
      @update:model-value="updateSettings({ textSpacing: String($event) as TextSpacing })"
    />
    <FormSelect
      :model-value="settings.density"
      name="density"
      :label="t('appearance.density')"
      :options="densityOptions"
      @update:model-value="updateSettings({ density: String($event) as Density })"
    />
    <FormSelect
      :model-value="settings.motion"
      name="motion"
      :label="t('appearance.motion')"
      :options="motionOptions"
      @update:model-value="updateSettings({ motion: String($event) as Motion })"
    />
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
