import { Model } from 'pinia-orm'
import Company from './Company'
import Contact from './Contact'

// A company a person works, or worked, for: with the title they had there and the period. A person can have several, one
// after the other or at the same time (a recruiter who works for two firms). `Contact.companyId` is the main one, kept in
// step with these (see syncMainCompany).
export default class ContactCompany extends Model {
  static entity = 'contactCompanies'

  declare id: string
  // When the record last changed (UTC). Set by the persistence; null for a record that was never stamped.
  declare updatedAt: string | null
  declare contactId: string
  declare companyId: string
  // What the person is there ("Talent acquisition", "CTO"), if known.
  declare title: string | null
  // The first and the last day, as plain dates (YYYY-MM-DD). No last day: it goes on.
  declare startedOn: string | null
  declare endedOn: string | null

  declare contact: Contact | null
  declare company: Company | null

  static fields() {
    return {
      id: this.uid(),
      updatedAt: this.string(null),
      contactId: this.attr(''),
      companyId: this.attr(''),
      title: this.string(null),
      startedOn: this.string(null),
      endedOn: this.string(null),
      contact: this.belongsTo(Contact, 'contactId'),
      company: this.belongsTo(Company, 'companyId'),
    }
  }
}
