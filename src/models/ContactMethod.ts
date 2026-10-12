import { Model } from 'pinia-orm'
import Contact from './Contact'

export const METHOD_TYPES = ['email', 'phone', 'linkedin', 'website', 'other'] as const
export type MethodType = (typeof METHOD_TYPES)[number]

// One way to reach a contact: an email, a phone number, a LinkedIn page, a website. A contact can have several of each,
// each with a label ("work", "personal"), and one of each type is the main one.
export default class ContactMethod extends Model {
  static entity = 'contactMethods'

  declare id: string
  declare contactId: string
  declare type: MethodType
  // In the canonical form of its type: E.164 for a phone, lower case for an email, the address of a page.
  declare value: string
  declare label: string | null
  declare isPrimary: boolean
  declare createdAt: string

  declare contact: Contact | null

  static fields() {
    return {
      id: this.uid(),
      contactId: this.attr(''),
      type: this.string('other'),
      value: this.string(''),
      label: this.string(null),
      isPrimary: this.boolean(false),
      createdAt: this.string(() => new Date().toISOString()),
      contact: this.belongsTo(Contact, 'contactId'),
    }
  }
}
