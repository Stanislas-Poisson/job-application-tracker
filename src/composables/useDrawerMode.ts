import { type ComputedRef, type InjectionKey, type Ref, computed, inject, provide, ref } from 'vue'

// The drawer of an application is read first and edited on purpose. The drawer holds the state, and every section reads it to
// show its rendering for reading or its form: a section writes both side by side.
export type DrawerMode = 'read' | 'edit'

const key: InjectionKey<Ref<DrawerMode>> = Symbol('drawer-mode')

export function provideDrawerMode(): Ref<DrawerMode> {
  const mode = ref<DrawerMode>('read')
  provide(key, mode)
  return mode
}

// A section used outside the drawer is a form, as it always was.
export function useDrawerMode(): { mode: Ref<DrawerMode>; isEditing: ComputedRef<boolean> } {
  const mode = inject(key, () => ref<DrawerMode>('edit'), true)
  return { mode, isEditing: computed(() => 'edit' === mode.value) }
}
