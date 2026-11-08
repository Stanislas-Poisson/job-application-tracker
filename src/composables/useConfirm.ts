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

// A question with several answers, for when two buttons do not say enough (save, drop, or keep going). The answer is the
// value of the choice, or null for Escape. The first choice that has `initial` takes the focus: the one that loses nothing.
export interface Choice {
  value: string
  label: string
  // The answer cannot be undone: it says so by its look.
  danger?: boolean
  initial?: boolean
}

export interface ChooseOptions {
  title?: string
  message: string
  choices: Choice[]
}

export interface PendingChoice extends ChooseOptions {
  answer: (value: string | null) => void
}

export const pendingChoice = shallowRef<PendingChoice | null>(null)

export function chooseAction(options: ChooseOptions): Promise<string | null> {
  pendingChoice.value?.answer(null)
  return new Promise<string | null>((resolve) => {
    const pending: PendingChoice = {
      ...options,
      answer: (value) => {
        if (pendingChoice.value === pending) {
          pendingChoice.value = null
        }
        resolve(value)
      },
    }
    pendingChoice.value = pending
  })
}
