import { type Component, Fragment, defineComponent, h } from 'vue'
import ConfirmHost from '../components/ConfirmHost.vue'
import NoticeHost from '../components/NoticeHost.vue'

// A page, and over it what every page can use: the messages and the dialog that asks a question.
export const shell = (page: Component): Component =>
  defineComponent({ render: () => h(Fragment, [h(page), h(NoticeHost), h(ConfirmHost)]) })
