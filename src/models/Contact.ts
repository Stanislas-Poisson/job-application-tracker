import { Model } from 'pinia-orm'
import Application from './Application'
import ApplicationContact from './ApplicationContact'
import Company from './Company'
import ContactMethod from './ContactMethod'
import Note from './Note'

// A person met during the search: a recruiter, a manager, a referral.
export default class Contact extends Model {
  static entity = 'contacts'

  declare id: string
  declare companyId: string | null
  declare firstName: string
  declare lastName: string
  declare role: string | null
  // Where the person is: an ISO 3166-1 country, an IANA time zone, and the languages they speak (BCP 47 tags).
  declare country: string | null
  declare timeZone: string | null
  declare languages: string[]
  declare createdAt: string

  declare company: Company | null
  declare methods: ContactMethod[]
  declare applications: Application[]
  declare notes: Note[]

  static fields() {
    return {
      id: this.uid(),
      companyId: this.attr(null),
      firstName: this.string(''),
      lastName: this.string(''),
      role: this.string(null),
      country: this.string(null),
      timeZone: this.string(null),
      languages: this.attr(() => []),
      createdAt: this.string(() => new Date().toISOString()),
      company: this.belongsTo(Company, 'companyId'),
      methods: this.hasMany(ContactMethod, 'contactId'),
      applications: this.belongsToMany(Application, ApplicationContact, 'contactId', 'applicationId'),
      notes: this.morphMany(Note, 'noteableId', 'noteableType'),
    }
  }
}
