import { Model } from 'pinia-orm'
import Contact from './Contact'
import JobOffer from './JobOffer'
import Note from './Note'

// A company that publishes offers or employs the contacts.
export default class Company extends Model {
  static entity = 'companies'

  declare id: string
  declare name: string
  declare website: string | null
  // Where the company is: the city, and its ISO 3166-1 country.
  declare city: string | null
  declare country: string | null
  declare sector: string | null
  declare createdAt: string

  declare offers: JobOffer[]
  declare contacts: Contact[]
  declare notes: Note[]

  static fields() {
    return {
      id: this.uid(),
      name: this.string(''),
      website: this.string(null),
      city: this.string(null),
      country: this.string(null),
      sector: this.string(null),
      createdAt: this.string(() => new Date().toISOString()),
      offers: this.hasMany(JobOffer, 'companyId'),
      contacts: this.hasMany(Contact, 'companyId'),
      notes: this.morphMany(Note, 'noteableId', 'noteableType'),
    }
  }
}
