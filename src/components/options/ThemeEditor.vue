<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import {
    type ContrastIssue,
    type CustomTheme,
    MAX_THEMES,
    THEME_COLORS,
    type ThemeColor,
    contrastIssues,
    exportTheme,
    importTheme,
    newTheme,
  } from '../../customTheme'
  import { nearestAccessible } from '../../utils/contrast'

  const { t, settings, updateSettings } = useApp()

  const themes = computed(() => settings.customThemes)
  const current = computed(() => themes.value.find((theme) => theme.id === settings.customThemeId) ?? null)
  const options = computed(() => ({
    '': t('customTheme.none'),
    ...Object.fromEntries(themes.value.map((theme) => [theme.id, theme.name])),
  }))

  const name = ref('')
  const message = ref('')
  const failed = ref(false)

  function say(text: string, error = false) {
    message.value = text
    failed.value = error
  }

  // Changes the theme in use; the page follows at once, and so do the other pages.
  function change(updated: CustomTheme) {
    void updateSettings({ customThemes: themes.value.map((theme) => (theme.id === updated.id ? updated : theme)) })
  }

  function add() {
    if (themes.value.length >= MAX_THEMES) {
      say(t('customTheme.tooMany'), true)
      return
    }
    const theme = newTheme(name.value || t('customTheme.defaultName'))
    void updateSettings({ customThemes: [...themes.value, theme], customThemeId: theme.id })
    name.value = ''
    say('')
  }

  function setColor(set: 'light' | 'dark', color: ThemeColor, value: string) {
    if (current.value) {
      change({ ...current.value, [set]: { ...current.value[set], [color]: value } })
    }
  }

  function rename(value: string) {
    if (current.value && '' !== value.trim()) {
      change({ ...current.value, name: value.trim().slice(0, 60) })
    }
  }

  const issues = (set: 'light' | 'dark'): ContrastIssue[] => (current.value ? contrastIssues(current.value[set]) : [])

  // The colour moves, as little as needed, to one that reaches the contrast.
  function correct(set: 'light' | 'dark', issue: ContrastIssue) {
    if (current.value) {
      const colors = current.value[set]
      setColor(set, issue.color, nearestAccessible(colors[issue.color], colors[issue.against], issue.needed))
    }
  }

  function remove() {
    if (current.value && window.confirm(t('customTheme.confirmDelete', { name: current.value.name }))) {
      const id = current.value.id
      void updateSettings({ customThemes: themes.value.filter((theme) => theme.id !== id), customThemeId: '' })
    }
  }

  function download() {
    if (!current.value) {
      return
    }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([exportTheme(current.value)], { type: 'application/json' }))
    link.download = `theme-${current.value.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function upload(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) {
      return
    }
    try {
      if (themes.value.length >= MAX_THEMES) {
        throw new Error('too-many')
      }
      const theme = importTheme(await file.text())
      void updateSettings({ customThemes: [...themes.value, theme], customThemeId: theme.id })
      say(t('customTheme.imported', { name: theme.name }))
    } catch (error) {
      say('too-many' === (error as Error).message ? t('customTheme.tooMany') : t('customTheme.notATheme'), true)
    }
  }

  const ratio = (value: number) => value.toFixed(2)
  const cssVars = (set: 'light' | 'dark') =>
    current.value
      ? {
          '--p-background': current.value[set].background,
          '--p-surface': current.value[set].surface,
          '--p-text': current.value[set].text,
          '--p-primary': current.value[set].primary,
          '--p-on-primary': current.value[set].onPrimary,
          '--p-success': current.value[set].success,
          '--p-warning': current.value[set].warning,
          '--p-error': current.value[set].error,
          '--p-border': current.value[set].border,
        }
      : {}
</script>

<template>
  <h3>{{ t('customTheme.title') }}</h3>
  <p class="muted">{{ t('customTheme.hint') }}</p>
  <div class="stack">
    <FormSelect
      :model-value="settings.customThemeId"
      name="customTheme"
      :label="t('customTheme.use')"
      :options="options"
      @update:model-value="updateSettings({ customThemeId: String($event) })"
    />

    <form
      class="row wrap"
      @submit.prevent="add"
    >
      <FormInput
        v-model="name"
        name="newTheme"
        :placeholder="t('customTheme.newName')"
        :field="false"
      />
      <FormButton type="submit">{{ t('customTheme.create') }}</FormButton>
      <label class="row wrap">
        {{ t('customTheme.import') }}
        <input
          id="theme-file"
          type="file"
          accept="application/json,.json"
          @change="upload"
        />
      </label>
    </form>
    <p
      v-if="message"
      :class="failed ? 'error' : 'success'"
      :role="failed ? 'alert' : 'status'"
    >
      {{ message }}
    </p>

    <section
      v-if="current"
      id="theme-editor"
      class="card stack"
    >
      <FormInput
        :model-value="current.name"
        name="themeName"
        :label="t('customTheme.name')"
        @update:model-value="rename(String($event))"
      />
      <div
        v-for="set in ['light', 'dark'] as const"
        :key="set"
        class="stack"
      >
        <h4>{{ t(`customTheme.${set}`) }}</h4>
        <div class="theme-colors">
          <label
            v-for="color in THEME_COLORS"
            :key="color"
            class="row"
          >
            <input
              type="color"
              :name="`${set}-${color}`"
              :value="current[set][color]"
              @change="setColor(set, color, ($event.target as HTMLInputElement).value)"
            />
            {{ t(`customTheme.colors.${color}`) }}
          </label>
        </div>
        <ul
          v-if="0 < issues(set).length"
          :id="`theme-issues-${set}`"
          class="stack"
        >
          <li
            v-for="issue in issues(set)"
            :key="`${issue.color}-${issue.against}`"
            class="row error"
          >
            {{
              t('customTheme.issue', {
                color: t(`customTheme.colors.${issue.color}`),
                against: t(`customTheme.colors.${issue.against}`),
                ratio: ratio(issue.ratio),
                needed: issue.needed,
              })
            }}
            <FormButton
              type="button"
              class="theme-correct"
              @click="correct(set, issue)"
              >{{ t('customTheme.correct') }}</FormButton
            >
          </li>
        </ul>
        <p
          v-else
          class="muted"
        >
          {{ t('customTheme.allGood') }}
        </p>
        <div
          class="theme-preview"
          :style="cssVars(set)"
        >
          <strong>{{ t('customTheme.previewTitle') }}</strong>
          <span>{{ t('customTheme.previewText') }}</span>
          <span class="theme-preview-primary">{{ t('customTheme.previewButton') }}</span>
          <span class="theme-preview-state theme-preview-success">{{ t('customTheme.colors.success') }}</span>
          <span class="theme-preview-state theme-preview-warning">{{ t('customTheme.colors.warning') }}</span>
          <span class="theme-preview-state theme-preview-error">{{ t('customTheme.colors.error') }}</span>
        </div>
      </div>
      <div class="row">
        <FormButton
          type="button"
          @click="download"
          >{{ t('customTheme.export') }}</FormButton
        >
        <FormButton
          type="button"
          @click="remove"
          >{{ t('customTheme.delete') }}</FormButton
        >
      </div>
    </section>
  </div>
</template>

<style lang="scss">
  .theme-colors {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.5rem;
  }

  .theme-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding: 0.75rem;
    color: var(--p-text);
    background: var(--p-background);
    border: 1px solid var(--p-border);
    border-radius: var(--zk-radius-lg);

    .theme-preview-primary {
      padding: 0.2rem 0.6rem;
      color: var(--p-on-primary);
      background: var(--p-primary);
      border-radius: var(--zk-radius-lg);
    }

    .theme-preview-state {
      padding: 0.1rem 0.4rem;
      background: var(--p-surface);
      border: 1px solid currentcolor;
      border-radius: var(--zk-radius-lg);
    }

    .theme-preview-success {
      color: var(--p-success);
    }

    .theme-preview-warning {
      color: var(--p-warning);
    }

    .theme-preview-error {
      color: var(--p-error);
    }
  }
</style>
