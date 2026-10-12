<script setup lang="ts">
  import { FormButton, FormInput } from '@zairakai/vue-components/Form'
  import { reactive } from 'vue'
  import { useApp } from '../../composables/useApp'
  import type { Application } from '../../models'
  import { addContact, unlinkContact } from '../../services/applications'

  const props = defineProps<{ application: Application }>()

  const { t } = useApp()

  const form = reactive({ firstName: '', lastName: '', role: '', email: '' })

  function add() {
    if ('' !== form.firstName.trim() || '' !== form.lastName.trim()) {
      addContact(props.application.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role || null,
        email: form.email || null,
      })
      Object.assign(form, { firstName: '', lastName: '', role: '', email: '' })
    }
  }
</script>

<template>
  <section>
    <h3>{{ t('drawer.contacts') }}</h3>
    <form
      class="stack"
      @submit.prevent="add"
    >
      <div class="row">
        <FormInput
          v-model="form.firstName"
          name="firstName"
          :placeholder="t('fields.firstName')"
        />
        <FormInput
          v-model="form.lastName"
          name="lastName"
          :placeholder="t('fields.lastName')"
        />
      </div>
      <FormInput
        v-model="form.role"
        name="role"
        :placeholder="t('fields.role')"
      />
      <FormInput
        v-model="form.email"
        name="email"
        type="email"
        :placeholder="t('fields.email')"
      />
      <FormButton type="submit">{{ t('drawer.addContact') }}</FormButton>
    </form>
    <ul>
      <li
        v-for="contact in application.contacts"
        :key="contact.id"
        class="row"
      >
        <span>
          {{ contact.firstName }} {{ contact.lastName }}
          <small
            v-if="contact.role"
            class="muted"
            >({{ contact.role }})</small
          >
          <small v-if="contact.email">
            <a :href="`mailto:${contact.email}`">{{ contact.email }}</a></small
          >
        </span>
        <FormButton
          type="button"
          @click="unlinkContact(application.id, contact.id)"
          >{{ t('drawer.unlink') }}</FormButton
        >
      </li>
    </ul>
  </section>
</template>
