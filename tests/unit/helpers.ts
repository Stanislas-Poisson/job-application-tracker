import { createPinia, setActivePinia } from 'pinia'
import { createORM } from 'pinia-orm'
import { seedDefaults } from '../../src/services/seed'

// A new store, as one page of the extension has it, with the default statuses and sources.
export function freshStore({ seed = true } = {}) {
  const pinia = createPinia().use(createORM())
  setActivePinia(pinia)
  if (seed) {
    seedDefaults(pinia)
  }
  return pinia
}
