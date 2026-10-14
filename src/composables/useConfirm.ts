import { shallowRef } from 'vue'

// A question that needs an answer before going on (empty the trash, replace the data, leave with text not saved). It is a
// native <dialog> drawn by ConfirmHost.vue, in the language and the look of the extension, not the box of the browser.

export interface ConfirmOptions {
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  // What is asked cannot be undone: the dialog says so by its look.
  danger?: boolean
}

export interface PendingConfirm extends ConfirmOptions {
  answer: (confirmed: boolean) => void
}

export const pendingConfirm = shallowRef<PendingConfirm | null>(null)

// Resolves true when the user confirms, false when they cancel, press Escape or another question replaces this one.
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  pendingConfirm.value?.answer(false)
  return new Promise<boolean>((resolve) => {
    const pending: PendingConfirm = {
      ...options,
      answer: (confirmed) => {
        if (pendingConfirm.value === pending) {
          pendingConfirm.value = null
        }
        resolve(confirmed)
      },
    }
    pendingConfirm.value = pending
  })
}

export const useConfirm = () => ({ confirm: confirmAction })
