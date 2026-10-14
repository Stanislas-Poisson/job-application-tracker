import { type Component, Fragment, defineComponent, h } from 'vue'
import ConfirmHost from '../components/ConfirmHost.vue'
import NoticeHost from '../components/NoticeHost.vue'
import SkipLink from '../components/SkipLink.vue'

// A page, and around it what every page can use: the link that skips the header, the messages and the dialog that asks a question.
export const shell = (page: Component): Component =>
  defineComponent({ render: () => h(Fragment, [h(SkipLink), h(page), h(NoticeHost), h(ConfirmHost)]) })
