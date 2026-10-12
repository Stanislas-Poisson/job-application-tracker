<script setup lang="ts">
  import { FormButton, FormInput, FormSelect, FormTextarea } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, onMounted, reactive, ref } from 'vue'
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import { useApp } from '../../composables/useApp'
  import { Status } from '../../models'
  import { addNote, captureOffer } from '../../services/applications'

  const { t, persistence } = useApp()

  const form = reactive({ title: '', company: '', url: '', location: '', statusKey: '', note: '' })
  const state = ref<'idle' | 'saving' | 'saved'>('idle')
  const problem = ref('')

  const statuses = computed(() => useRepo(Status).orderBy('order').get())
  const statusOptions = computed(() => Object.fromEntries(statuses.value.map((status) => [status.key, status.label])))
  const boardUrl = browser.runtime.getURL('/board.html' as never)

  // The page the user is looking at fills the title and the address. Both can be changed.
  onMounted(async () => {
    form.statusKey = statuses.value[0]?.key ?? ''
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (tab?.url && /^https?:/.test(tab.url)) {
        form.url = tab.url
        form.title = tab.title ?? ''
      }
    } catch {
      // The tab cannot be read (a browser page): the user types the offer.
    }
  })

  async function save() {
    problem.value = ''
    if ('' === form.title.trim() || '' === form.company.trim()) {
      problem.value = t('popup.required')
      return
    }

    state.value = 'saving'
    const application = captureOffer({
      title: form.title,
      companyName: form.company,
      url: form.url || null,
      location: form.location || null,
      statusKey: form.statusKey,
    })
    if ('' !== form.note.trim()) {
      addNote('applications', application.id, form.note)
    }
    // The popup closes as soon as the user clicks away: the data is written before saying it is saved.
    await persistence.flush()
    state.value = 'saved'
  }

  function another() {
    Object.assign(form, { title: '', company: '', url: '', location: '', note: '' })
    state.value = 'idle'
  }
</script>

<template>
  <main class="page page-popup">
    <AppHeader :title="t('popup.title')">
      <a
        :href="boardUrl"
        target="_blank"
        rel="noopener"
        >{{ t('nav.board') }}</a
      >
      <a
        href="#"
        @click.prevent="browser.runtime.openOptionsPage()"
        >{{ t('nav.options') }}</a
      >
    </AppHeader>

    <section
      v-if="'saved' === state"
      class="card stack"
    >
      <p class="success">{{ t('popup.saved') }}</p>
      <div class="row">
        <a
          :href="boardUrl"
          target="_blank"
          rel="noopener"
          >{{ t('popup.openBoard') }}</a
        >
        <FormButton
          type="button"
          @click="another"
          >{{ t('popup.another') }}</FormButton
        >
      </div>
    </section>

    <form
      v-else
      class="card stack"
      @submit.prevent="save"
    >
      <FormInput
        v-model="form.title"
        name="title"
        :label="t('fields.title')"
        required
      />
      <FormInput
        v-model="form.company"
        name="company"
        :label="t('fields.company')"
        required
      />
      <FormInput
        v-model="form.url"
        name="url"
        type="url"
        :label="t('fields.url')"
      />
      <FormInput
        v-model="form.location"
        name="location"
        :label="t('fields.location')"
      />
      <FormSelect
        v-model="form.statusKey"
        name="status"
        :label="t('fields.status')"
        :options="statusOptions"
      />
      <FormTextarea
        v-model="form.note"
        name="note"
        :label="t('fields.note')"
        :rows="3"
      />
      <p
        v-if="problem"
        class="error"
      >
        {{ problem }}
      </p>
      <FormButton
        type="submit"
        :disabled="'saving' === state"
        >{{ t('popup.save') }}</FormButton
      >
    </form>

    <AppFooter />
  </main>
</template>

<style lang="scss">
  .page-popup {
    width: 26rem;
    min-width: 26rem;
    padding: 1rem;
  }
</style>
