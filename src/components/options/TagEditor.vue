<script setup lang="ts">
  import { FormButton, FormInput } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { notifyUndo } from '../../composables/useNotices'
  import { Tag } from '../../models'
  import { normalizeSymbol } from '../../services/symbol'
  import { TagError, createTag, deleteTag, recolorTag, renameTag, tagUsage } from '../../services/tags'
  import { deleteWithUndo } from '../../services/undo'

  const { t, tn, persistence, settings, updateSettings } = useApp()

  const name = ref('')
  const problem = ref('')

  const tags = computed(() => useRepo(Tag).orderBy('name').get())

  // A refused change is said under the list, and the field keeps what the tag was named.
  function attempt(action: () => void) {
    problem.value = ''
    try {
      action()
    } catch (error) {
      if (error instanceof TagError) {
        problem.value = t(`labels.errors.${error.code}`)
        return
      }
      throw error
    }
  }

  function add() {
    attempt(() => {
      createTag(name.value)
      name.value = ''
    })
  }

  // One character: what is typed after the first is dropped, and the field shows what was kept.
  function setSymbol(tag: Tag, input: HTMLInputElement) {
    const symbol = normalizeSymbol(input.value)
    input.value = symbol ?? ''
    useRepo(Tag).where('id', tag.id).update({ symbol })
  }

  // The tag goes to the trash with its links; the message offers to put it back.
  async function remove(tag: Tag) {
    const name = tag.name
    const undo = await deleteWithUndo(persistence, () => deleteTag(tag.id))
    notifyUndo(t('notice.removed', { name }), t('notice.undo'), async () => {
      await undo()
    })
  }
</script>

<template>
  <h2>{{ t('labels.manage') }}</h2>
  <p class="muted">{{ t('labels.manageHint') }}</p>
  <label class="row">
    <input
      type="checkbox"
      name="showTagSymbols"
      :checked="settings.showTagSymbols"
      @change="updateSettings({ showTagSymbols: ($event.target as HTMLInputElement).checked })"
    />
    {{ t('labels.showSymbols') }}
  </label>
  <p
    v-if="0 === tags.length"
    class="muted"
  >
    {{ t('labels.none') }}
  </p>
  <ul class="status-list">
    <li
      v-for="tag in tags"
      :key="tag.id"
      class="row"
    >
      <input
        type="color"
        :value="tag.color"
        :aria-label="t('options.color')"
        @change="attempt(() => recolorTag(tag.id, ($event.target as HTMLInputElement).value))"
      />
      <input
        class="symbol-input"
        type="text"
        :name="`symbol-${tag.id}`"
        :value="tag.symbol ?? ''"
        :aria-label="t('options.symbol')"
        :placeholder="t('options.symbolHint')"
        maxlength="16"
        @change="setSymbol(tag, $event.target as HTMLInputElement)"
      />
      <FormInput
        :model-value="tag.name"
        :name="`tag-${tag.id}`"
        :field="false"
        @update:model-value="attempt(() => renameTag(tag.id, String($event)))"
      />
      <span class="muted">{{ tn('labels.usage', tagUsage(tag.id)) }}</span>
      <FormButton
        type="button"
        @click="remove(tag)"
      >
        {{ t('options.remove') }}
      </FormButton>
    </li>
  </ul>
  <form
    class="row"
    @submit.prevent="add"
  >
    <FormInput
      v-model="name"
      name="newTag"
      :placeholder="t('labels.add')"
      :field="false"
    />
    <FormButton type="submit">{{ t('options.add') }}</FormButton>
  </form>
  <p
    v-if="problem"
    class="error"
    role="alert"
  >
    {{ problem }}
  </p>
</template>
