<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { computed, reactive, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { useDrawerMode } from '../../composables/useDrawerMode'
  import type { Contact } from '../../models'
  import { METHOD_TYPES, type MethodType } from '../../models/ContactMethod'
  import { addContactMethod, removeContactMethod, setPrimaryMethod, sortedMethods } from '../../services/contactMethods'
  import { ContactError } from '../../services/contacts'
  import { formatPhone, resolveCountry } from '../../utils/contact'

  const props = defineProps<{ contact: Contact }>()

  const { t, settings } = useApp()
  const { isEditing } = useDrawerMode()

  const form = reactive({ type: 'email' as MethodType, value: '', label: '' })
  useDirtyGuard(() => hasText(form.value, form.label))
  const problem = ref('')

  const methods = computed(() => sortedMethods(props.contact.methods ?? []))
  const typeOptions = computed(() => Object.fromEntries(METHOD_TYPES.map((type) => [type, t(`methods.types.${type}`)])))

  // The value as the user reads it, and the address a click goes to.
  const shown = (type: MethodType, value: string) => ('phone' === type ? formatPhone(value) : value)
  const link = (type: MethodType, value: string): string | null =>
    ({ email: `mailto:${value}`, phone: `tel:${value}`, linkedin: value, website: value })[type as 'email'] ?? null

  function add() {
    problem.value = ''
    try {
      addContactMethod(
        props.contact.id,
        { type: form.type, value: form.value, label: form.label },
        { defaultCountry: resolveCountry(settings.defaultCountry, navigator.language) }
      )
    } catch (error) {
      if (error instanceof ContactError) {
        problem.value = t(`drawer.contactErrors.${error.code}`)
        return
      }
      throw error
    }
    Object.assign(form, { value: '', label: '' })
  }
</script>

<template>
  <div
    v-if="isEditing || 0 < methods.length"
    class="methods"
  >
    <ul class="method-list">
      <li
        v-for="method in methods"
        :key="method.id"
        class="method"
      >
        <span class="muted">{{ t(`methods.types.${method.type}`) }}</span>
        <a
          v-if="link(method.type, method.value)"
          :href="link(method.type, method.value) ?? undefined"
          :target="'phone' === method.type || 'email' === method.type ? undefined : '_blank'"
          rel="noopener"
          dir="ltr"
          >{{ shown(method.type, method.value) }}</a
        >
        <span
          v-else
          dir="auto"
          >{{ method.value }}</span
        >
        <small
          v-if="method.label"
          class="muted"
          >({{ method.label }})</small
        >
        <small
          v-if="method.isPrimary"
          class="primary-mark"
          >{{ t('methods.main') }}</small
        >
        <FormButton
          v-else-if="isEditing"
          type="button"
          @click="setPrimaryMethod(method.id)"
        >
          {{ t('methods.makeMain') }}
        </FormButton>
        <FormButton
          v-if="isEditing"
          type="button"
          @click="removeContactMethod(method.id)"
        >
          {{ t('methods.remove') }}
        </FormButton>
      </li>
    </ul>
    <form
      v-if="isEditing"
      class="row method-form"
      @submit.prevent="add"
    >
      <FormSelect
        v-model="form.type"
        name="methodType"
        :options="typeOptions"
        :label="t('methods.type')"
      />
      <FormInput
        v-model="form.value"
        name="methodValue"
        :placeholder="t('methods.value')"
      />
      <FormInput
        v-model="form.label"
        name="methodLabel"
        :placeholder="t('methods.label')"
      />
      <FormButton type="submit">{{ t('methods.add') }}</FormButton>
    </form>
    <p
      v-if="problem"
      class="error"
      role="alert"
    >
      {{ problem }}
    </p>
  </div>
</template>

<style lang="scss">
  .methods {
    margin-block-start: 0.5rem;
  }

  .method-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .method {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.6rem;
    align-items: center;
    padding-block: 0.25rem;
    border: 0;
    font-size: 0.85rem;
  }

  .primary-mark {
    color: var(--zk-success);
  }

  .method-form {
    flex-wrap: wrap;
    align-items: end;
  }
</style>
