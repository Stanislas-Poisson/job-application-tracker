<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { ref } from 'vue'
  import { useApp } from '../composables/useApp'
  import { useBackup } from '../composables/useBackup'

  const props = defineProps<{ mode: 'setup' | 'unlock' }>()
  const emit = defineEmits<{ done: [] }>()

  const { t } = useApp()
  const { message, failed, setup, unlock } = useBackup()

  const passphrase = ref('')
  const again = ref('')
  const working = ref(false)

  async function submit() {
    working.value = true
    try {
      const done = 'setup' === props.mode ? await setup(passphrase.value, again.value) : await unlock(passphrase.value)
      if (done) {
        passphrase.value = ''
        again.value = ''
        emit('done')
      }
    } finally {
      working.value = false
    }
  }
</script>

<template>
  <form
    class="stack"
    :class="`passphrase-${mode}`"
    novalidate
    @submit.prevent="submit"
  >
    <p
      v-if="'setup' === mode"
      class="muted"
    >
      {{ t('backup.warning') }}
    </p>
    <label>
      {{ t('backup.passphrase') }}
      <input
        v-model="passphrase"
        name="passphrase"
        type="password"
        autocomplete="new-password"
        required
      />
    </label>
    <label v-if="'setup' === mode">
      {{ t('backup.passphraseAgain') }}
      <input
        v-model="again"
        name="passphraseAgain"
        type="password"
        autocomplete="new-password"
        required
      />
    </label>
    <FormButton
      type="submit"
      :disabled="working"
      >{{ 'setup' === mode ? t('backup.set') : t('backup.unlock') }}</FormButton
    >
    <p
      v-if="message"
      :class="failed ? 'error' : 'success'"
    >
      {{ message }}
    </p>
  </form>
</template>
