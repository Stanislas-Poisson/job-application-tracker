import { listTrash, restoreFromTrash } from './trash'

// Runs a deletion, saves it at once, and gives back a function that puts back what it removed. The records go to the trash
// when they are saved, so what the deletion put there is what is new in it: nothing else is touched by the undo.
export async function deleteWithUndo(
  persistence: { flush: () => Promise<void> },
  remove: () => void
): Promise<() => Promise<number>> {
  const before = new Set(listTrash().map((group) => group.batch))
  remove()
  await persistence.flush()
  const batches = listTrash()
    .map((group) => group.batch)
    .filter((batch) => !before.has(batch))
  return async () => {
    const back = batches.reduce((total, batch) => total + restoreFromTrash(batch), 0)
    await persistence.flush()
    return back
  }
}
