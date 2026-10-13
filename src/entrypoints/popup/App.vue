<script setup lang="ts">
  import { FormButton, FormInput, FormSelect, FormTextarea } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import { useApp } from '../../composables/useApp'
  import { adapterFor } from '../../extraction/adapters'
  import { type ReadOffer } from '../../extraction/jobPosting'
  import { collectSnapshot } from '../../extraction/page'
  import { readSnapshot } from '../../extraction/read'
  import { reportMailto, reportUrl } from '../../extraction/report'
  import { Status } from '../../models'
  import { browserAdapter } from '../../persistence/adapter'
  import { addNote, captureOffer } from '../../services/applications'
  import { clearDraft, draftFor, loadDraft, saveDraft } from '../../services/draft'
  import { resolveTimeZone } from '../../utils/time'

  const { t, persistence, settings } = useApp()

  const form = reactive({ title: '', company: '', url: '', location: '', statusKey: '', note: '' })
  const state = ref<'idle' | 'saving' | 'saved'>('idle')
  const problem = ref('')
  // What the page said beyond the fields of the form (the date, the salary, the description). It is saved with them.
  const read = ref<ReadOffer>({})
  // The address of the page, to name the site in a report. Nothing else of the page goes into it.
  const pageUrl = ref('')
  const found = computed(() =>
    ['address', 'postedOn', 'salary', 'contractType', 'description'].filter((key) => key in read.value)
  )

  const statuses = computed(() => useRepo(Status).orderBy('order').get())
  const statusOptions = computed(() => Object.fromEntries(statuses.value.map((status) => [status.key, status.label])))
  const report = computed(() => reportUrl(pageUrl.value, read.value, browser.runtime.getManifest().version))
  const reportMail = computed(() => reportMailto(pageUrl.value, read.value, browser.runtime.getManifest().version))
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
      await readPage(tab?.id)
    } catch {
      // The tab cannot be read (a browser page): the user types the offer.
    }
    // What was typed here and not saved comes back, for the same page only.
    const draft = draftFor(await loadDraft(browserAdapter), form.url)
    if (draft) {
      Object.assign(form, {
        title: draft.title,
        company: draft.company,
        location: draft.location,
        note: draft.note,
        statusKey: statuses.value.some((status) => status.key === draft.statusKey) ? draft.statusKey : form.statusKey,
      })
    }
    drafting.value = true
  })

  // The popup closes on a click elsewhere and cannot warn: what is typed is kept as a draft, as it is typed.
  const drafting = ref(false)
  watch(
    form,
    () => {
      if (drafting.value && 'idle' === state.value) {
        // Nothing typed: no draft (and the one of a saved offer is gone).
        const typed = [form.title, form.company, form.location, form.note].some((value) => '' !== value.trim())
        void (typed ? saveDraft(browserAdapter, { ...form }) : clearDraft(browserAdapter))
      }
    },
    { deep: true }
  )

  // Reads the page the user is looking at, once, because the popup was opened on it (activeTab). Nothing is read in the
  // background and nothing leaves the browser.
  async function readPage(tabId: number | undefined) {
    if (undefined === tabId) {
      return
    }
    // The body of the page is only taken for a site that has an adapter.
    const withBody = adapterFor(form.url)?.needsBody ?? false
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: collectSnapshot,
      args: [withBody],
    })
    if (!result?.result) {
      return
    }
    pageUrl.value = result.result.url
    read.value = readSnapshot(result.result, resolveTimeZone(settings.timeZone))
    form.title = read.value.title ?? form.title
    form.company = read.value.companyName ?? form.company
    form.location = read.value.location ?? form.location
  }

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
      country: read.value.country ?? null,
      address: read.value.address ?? null,
      contractType: read.value.contractType ?? null,
      workMode: read.value.workMode ?? null,
      description: read.value.description ?? null,
      postedOn: read.value.postedOn ?? null,
      salary: read.value.salary ?? null,
      statusKey: form.statusKey,
    })
    if ('' !== form.note.trim()) {
      addNote('applications', application.id, form.note)
    }
    // The popup closes as soon as the user clicks away: the data is written before saying it is saved.
    await persistence.flush()
    await clearDraft(browserAdapter)
    state.value = 'saved'
  }

  function another() {
    Object.assign(form, { title: '', company: '', url: '', location: '', note: '' })
    read.value = {}
    state.value = 'idle'
    void clearDraft(browserAdapter)
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
      <p
        v-if="0 < found.length"
        class="muted"
      >
        {{ t('popup.found', { list: found.map((key) => t(`popup.foundKeys.${key}`)).join(', ') }) }}
      </p>
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
      <a
        v-if="'' !== pageUrl"
        :href="report"
        target="_blank"
        rel="noopener"
        class="muted"
        >{{ t('popup.report') }}</a
      >
      <a
        v-if="'' !== pageUrl"
        :href="reportMail"
        class="muted"
        >{{ t('popup.reportMail') }}</a
      >
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
