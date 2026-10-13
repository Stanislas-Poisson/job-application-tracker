<script setup lang="ts">
  import { computed } from 'vue'
  import { symbolToShow } from '../services/symbol'

  // The symbol of a column or of a tag, in front of its name. Hidden from a screen reader: the name is what is read.
  const props = defineProps<{ symbol: string | null | undefined }>()
  const shown = computed(() => symbolToShow(props.symbol))
</script>

<template>
  <span
    v-if="shown"
    class="item-symbol"
    aria-hidden="true"
    >{{ shown }}</span
  >
</template>
