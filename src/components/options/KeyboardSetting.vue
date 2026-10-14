<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useKeyboardLayout } from '../../composables/useKeyboardLayout'
  import {
    DEFAULT_KEYS,
    KEY_ACTIONS,
    type KeyAction,
    type KeyBinding,
    type ShortcutKeys,
    bindingFromEvent,
    conflicts,
    describeKey,
    keysInUse,
  } from '../../services/shortcutKeys'

  const { t, settings, updateSettings } = useApp()
  const layout = useKeyboardLayout()

  type Table = Record<KeyAction, KeyBinding | null>

  // What is saved, by action, and what the person is editing. They differ only while two actions have the same key: nothing
  // is saved until that is put right, and the person can set a key that another action has, to swap them.
  const saved = computed(() => keysInUse(settings.shortcutKeys, layout.known.value))
  const draft = ref<Table>({ ...saved.value })
  const clashes = computed(() => conflicts(draft.value))
  const held = computed(() => 0 < clashes.value.length)
  const listening = ref<KeyAction | null>(null)
  const problem = ref('')

  watch(saved, (value) => {
    if (!held.value) {
      draft.value = { ...value }
    }
  })

  const letterOf = (code: string) => layout.letterOf(code)
  const show = (binding: KeyBinding | null) => (binding ? describeKey(binding, letterOf) : t('keyboard.notSet'))
  const clashing = (action: KeyAction) => clashes.value.some((group) => group.includes(action))
  const clashText = computed(() => clashes.value.map((group) => show(draft.value[group[0] as KeyAction])).join(', '))

  const same = (a: KeyBinding | null, b: KeyBinding | null) =>
    a === b || (null !== a && null !== b && a.code === b.code && a.shift === b.shift)

  // What is stored: an action the person did not touch stays as it was stored (no key of its own: its default, where the layout
  // is known), a key that is the default is not stored, and a key that was removed is a null.
  function stored(table: Table): ShortcutKeys {
    const found: ShortcutKeys = {}
    for (const action of KEY_ACTIONS) {
      const binding = table[action]
      const fallback = DEFAULT_KEYS[action]
      const before = settings.shortcutKeys[action]
      if (same(binding, saved.value[action])) {
        if (undefined !== before) {
          found[action] = before
        }
      } else if (null === binding) {
        found[action] = null
      } else if (binding.code !== fallback.code || binding.shift !== fallback.shift) {
        found[action] = binding
      }
    }
    return found
  }

  function commit() {
    if (!held.value) {
      void updateSettings({ shortcutKeys: stored(draft.value) })
    }
  }

  function setKey(action: KeyAction, binding: KeyBinding | null) {
    draft.value = { ...draft.value, [action]: binding }
    commit()
  }

  // The next key pressed is the one chosen. The keys that only hold another one (Shift before A) are waited past; Escape gives up.
  function onKeydown(event: KeyboardEvent) {
    if (!listening.value) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if ('Escape' === event.key) {
      listening.value = null
      problem.value = ''
      return
    }
    if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(event.key)) {
      return
    }
    const result = bindingFromEvent(event)
    if ('problem' in result) {
      problem.value = t('keyboard.forbidden')
      return
    }
    problem.value = ''
    setKey(listening.value, result.binding)
    listening.value = null
  }

  onMounted(() => document.addEventListener('keydown', onKeydown, true))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))

  function discard() {
    draft.value = { ...saved.value }
  }

  function reset() {
    listening.value = null
    problem.value = ''
    draft.value = keysInUse({}, layout.known.value)
    void updateSettings({ shortcutKeys: {} })
  }
</script>

<template>
  <h2>{{ t('keyboard.title') }}</h2>
  <div class="stack">
    <label class="row">
      <input
        type="checkbox"
        name="shortcuts"
        :checked="settings.shortcuts"
        @change="updateSettings({ shortcuts: ($event.target as HTMLInputElement).checked })"
      />
      {{ t('keyboard.enable') }}
    </label>
    <p class="muted">{{ t('keyboard.hint') }}</p>
    <p class="muted">{{ t('keyboard.layoutHint') }}</p>
    <p
      v-if="!layout.known.value"
      class="muted"
    >
      {{ t('keyboard.unknownLayout') }}
    </p>

    <ul class="key-list">
      <li
        v-for="action in KEY_ACTIONS"
        :key="action"
        class="row"
      >
        <span class="key-action">{{ t(`keyboard.actions.${action}`) }}</span>
        <kbd
          :class="{ clash: clashing(action) }"
          :data-key="action"
          >{{ show(draft[action]) }}</kbd
        >
        <FormButton
          type="button"
          :name="`key-${action}`"
          :aria-describedby="clashing(action) ? 'key-conflict' : undefined"
          @click="((listening = action), (problem = ''))"
        >
          {{ t('keyboard.change') }}<span class="visually-hidden">: {{ t(`keyboard.actions.${action}`) }}</span>
        </FormButton>
        <FormButton
          v-if="draft[action]"
          type="button"
          @click="setKey(action, null)"
        >
          {{ t('keyboard.remove') }}<span class="visually-hidden">: {{ t(`keyboard.actions.${action}`) }}</span>
        </FormButton>
        <span
          v-if="listening === action"
          class="muted"
          role="status"
          >{{ t('keyboard.press') }}</span
        >
      </li>
    </ul>
    <p
      v-if="problem"
      class="error"
      role="alert"
    >
      {{ problem }}
    </p>
    <p
      v-if="held"
      id="key-conflict"
      class="error"
      role="alert"
    >
      {{ t('keyboard.conflict', { keys: clashText }) }}
    </p>
    <div class="row wrap">
      <FormButton
        v-if="held"
        type="button"
        name="discard-keys"
        @click="discard"
        >{{ t('keyboard.discard') }}</FormButton
      >
      <FormButton
        type="button"
        name="reset-keys"
        @click="reset"
        >{{ t('keyboard.reset') }}</FormButton
      >
    </div>

    <dl class="shortcuts">
      <div>
        <dt><kbd>&uarr;</kbd> <kbd>&darr;</kbd> <kbd>&larr;</kbd> <kbd>&rarr;</kbd></dt>
        <dd>{{ t('keyboard.cards') }}</dd>
      </div>
      <div>
        <dt><kbd>Shift</kbd> + <kbd>&larr;</kbd> <kbd>&rarr;</kbd></dt>
        <dd>{{ t('keyboard.move') }}</dd>
      </div>
    </dl>
    <p class="muted">{{ t('keyboard.browser') }}</p>
  </div>
</template>

<style lang="scss">
  .key-list {
    padding: 0;
    margin: 0;
    list-style: none;

    li {
      flex-wrap: wrap;
      padding: 0.35rem 0;
    }

    .key-action {
      flex: 1 1 12rem;
    }
  }

  .shortcuts {
    display: grid;
    gap: 0.4rem;
    margin: 0;

    > div {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem 0.8rem;
      align-items: baseline;
    }

    dt {
      min-inline-size: 9rem;
    }

    dd {
      margin: 0;
    }
  }

  kbd {
    display: inline-block;
    min-inline-size: 2rem;
    padding: 0.05rem 0.4rem;
    font: inherit;
    font-size: 0.85em;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--zk-border-strong);
    border-radius: 4px;

    &.clash {
      border-color: var(--error);
      border-width: 2px;
    }
  }
</style>
