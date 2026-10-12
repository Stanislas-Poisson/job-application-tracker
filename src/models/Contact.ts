import { Model } from 'pinia-orm'
import Application from './Application'
import ApplicationContact from './ApplicationContact'
import Company from './Company'
import Note from './Note'

// A person met during the search: a recruiter, a manager, a referral.
export default class Contact extends Model {
  static entity = 'contacts'

  declare id: string
  declare companyId: string | null
  declare firstName: string
  declare lastName: string
  declare role: string | null
  declare email: string | null
  declare phone: string | null
  declare linkedin: string | null
  declare createdAt: string

  declare company: Company | null
  declare applications: Application[]
  declare notes: Note[]

  static fields() {
    return {
      id: this.uid(),
      companyId: this.attr(null),
      firstName: this.string(''),
      lastName: this.string(''),
      role: this.string(null),
      email: this.string(null),
      phone: this.string(null),
      linkedin: this.string(null),
      createdAt: this.string(() => new Date().toISOString()),
      company: this.belongsTo(Company, 'companyId'),
      applications: this.belongsToMany(Application, ApplicationContact, 'contactId', 'applicationId'),
      notes: this.morphMany(Note, 'noteableId', 'noteableType'),
    }
  }
}
