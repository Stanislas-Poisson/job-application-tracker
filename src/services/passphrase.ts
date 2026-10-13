import { ref } from 'vue'

// The passphrase of the backups, kept in the memory of the page only, so that it is asked once per page and not at every
// backup. It is never written anywhere: closing the page forgets it.
export const sessionPassphrase = ref<string | null>(null)
