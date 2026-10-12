<script setup lang="ts">
  import { slugify } from '@zairakai/js-utils/formatters'
  import { FormButton, FormInput } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { Application, Status } from '../../models'

  const { t } = useApp()

  const newLabel = ref('')

  const statuses = computed(() => useRepo(Status).orderBy('order').get())

  const usage = (status: Status) => useRepo(Application).where('statusId', status.id).get().length

  // An empty name is not kept: the column would have no title. The field shows what is typed, the column keeps its name.
  function rename(status: Status, label: string) {
    if ('' === label.trim()) {
      return
    }
    useRepo(Status).where('id', status.id).update({ label })
  }

  function recolor(status: Status, color: string) {
    useRepo(Status).where('id', status.id).update({ color })
  }

  function setFinal(status: Status, isFinal: boolean) {
    useRepo(Status).where('id', status.id).update({ isFinal })
  }

  // Swaps the place of a status with its neighbour, and numbers them again so that no two share a place.
  function move(status: Status, step: -1 | 1) {
    const list = [...statuses.value]
    const from = list.findIndex((candidate) => candidate.id === status.id)
    const to = from + step
    if (0 > to || to >= list.length) {
      return
    }
    const [item] = list.splice(from, 1)
    if (item) {
      list.splice(to, 0, item)
    }
    list.forEach((candidate, order) => useRepo(Status).where('id', candidate.id).update({ order }))
  }

  function remove(status: Status) {
    if (0 === usage(status)) {
      useRepo(Status).destroy(status.id)
    }
  }

  function add() {
    const label = newLabel.value.trim()
    if ('' === label) {
      return
    }
    const taken = new Set(statuses.value.map((status) => status.key))
    let key = slugify(label).replace(/-/g, '_') || 'status'
    for (let suffix = 2; taken.has(key); suffix += 1) {
      key = `${slugify(label).replace(/-/g, '_')}_${suffix}`
    }
    useRepo(Status).save({ key, label, order: statuses.value.length })
    newLabel.value = ''
  }
</script>

<template>
  <h2>{{ t('options.statuses') }}</h2>
  <p class="muted">{{ t('options.statusesHint') }}</p>
  <ul class="status-list">
    <li
      v-for="(status, index) in statuses"
      :key="status.id"
      class="row"
    >
      <input
        type="color"
        :value="status.color"
        :aria-label="t('options.color')"
        @change="recolor(status, ($event.target as HTMLInputElement).value)"
      />
      <FormInput
        :model-value="status.label"
        :name="`label-${status.id}`"
        :field="false"
        @update:model-value="rename(status, String($event))"
      />
      <label class="row">
        <input
          type="checkbox"
          :checked="status.isFinal"
          @change="setFinal(status, ($event.target as HTMLInputElement).checked)"
        />
        {{ t('options.final') }}
      </label>
      <FormButton
        type="button"
        :disabled="0 === index"
        @click="move(status, -1)"
        >&uarr;</FormButton
      >
      <FormButton
        type="button"
        :disabled="index === statuses.length - 1"
        @click="move(status, 1)"
        >&darr;</FormButton
      >
      <FormButton
        type="button"
        :disabled="0 < usage(status)"
        :title="t('options.inUse')"
        @click="remove(status)"
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
      v-model="newLabel"
      name="newStatus"
      :placeholder="t('options.newStatus')"
      :field="false"
    />
    <FormButton type="submit">{{ t('options.add') }}</FormButton>
  </form>
</template>

<style lang="scss">
  .status-list {
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;

    li {
      padding: 0.35rem 0;
    }
  }
</style>
