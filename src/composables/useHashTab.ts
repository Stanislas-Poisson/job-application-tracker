import { onMounted, onUnmounted, ref } from 'vue'

// The tab in use, kept in the address of the page (#tab=<id>), so that a link, the back button and a reload keep the place.
// An address that names a tab that does not exist gives the first one.
export function useHashTab(ids: readonly string[], key = 'tab') {
  const read = (): string => {
    const found = new RegExp(`(?:^#|&)${key}=([^&]+)`).exec(location.hash)?.[1]
    const id = undefined === found ? '' : decodeURIComponent(found)
    return ids.includes(id) ? id : (ids[0] ?? '')
  }
  const tab = ref(read())

  const onHash = () => (tab.value = read())
  onMounted(() => window.addEventListener('hashchange', onHash))
  onUnmounted(() => window.removeEventListener('hashchange', onHash))

  // Choosing a tab writes the address (one step of the history), which then says the same tab.
  function choose(id: string) {
    if (id !== tab.value) {
      location.hash = `${key}=${encodeURIComponent(id)}`
    }
    tab.value = id
  }

  return { tab, choose }
}
