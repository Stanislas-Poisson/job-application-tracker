import { Model } from 'pinia-orm'

export type ContactRole = 'recruiter' | 'interviewer' | 'referral' | 'other'

// The pivot between an application and a contact, with the part the contact plays in it.
export default class ApplicationContact extends Model {
  static entity = 'applicationContacts'

  declare id: string
  declare applicationId: string
  declare contactId: string
  declare role: ContactRole

  static fields() {
    return {
      id: this.uid(),
      applicationId: this.attr(''),
      contactId: this.attr(''),
      role: this.string('other'),
    }
  }
}
