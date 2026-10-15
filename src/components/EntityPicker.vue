<script setup lang="ts">
  import { FormInput } from '@zairakai/vue-components/Form'
  import { computed, onMounted, ref, useId } from 'vue'
  import { useApp } from '../composables/useApp'
  import { sameText } from '../utils/text'

  // A field that names something that may exist (a company, a contact, a tag): it offers the ones that exist, and says under the
  // field whether what is typed is one of them, or a new one that will be made when the form is saved. The case and the accents
  // are ignored, as the search ignores them. The value is the text: the form finds or creates by it.
  const props = defineProps<{
    modelValue: string
    options: string[]
    name: string
    label?: string
    placeholder?: string
    required?: boolean
  }>()
  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

  const { t } = useApp()
  const id = useId()
  const listId = `${id}-list`
  const hintId = `${id}-hint`
  const root = ref<HTMLElement | null>(null)

  const names = computed(() => [...new Set(props.options)].sort((a, b) => a.localeCompare(b)))
  const typed = computed(() => props.modelValue.trim())
  const existing = computed(() =>
    '' === typed.value ? null : (names.value.find((name) => sameText(name, typed.value)) ?? null)
  )
  const hint = computed(() => {
    if ('' === typed.value) {
      return ''
    }
    return null === existing.value ? t('picker.new') : t('picker.existing', { name: existing.value })
  })

  // The hint describes the field to a screen reader. The field is inside a component of the library, which does not pass the
  // attribute on.
  onMounted(() => root.value?.querySelector('input')?.setAttribute('aria-describedby', hintId))
</script>

<template>
  <div
    ref="root"
    class="entity-picker"
  >
    <FormInput
      :model-value="modelValue"
      :name="name"
      :label="label"
      :placeholder="placeholder"
      :required="required"
      :list="listId"
      autocomplete="off"
      @update:model-value="emit('update:modelValue', String($event ?? ''))"
    />
    <datalist :id="listId">
      <option
        v-for="option in names"
        :key="option"
        :value="option"
      />
    </datalist>
    <p
      v-if="'' !== hint"
      :id="hintId"
      class="muted picker-hint"
      :data-state="null === existing ? 'new' : 'existing'"
    >
      {{ hint }}
    </p>
  </div>
</template>

<style lang="scss">
  .picker-hint {
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
  }
</style>
