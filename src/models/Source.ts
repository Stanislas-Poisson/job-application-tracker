import { Model } from 'pinia-orm'
import JobOffer from './JobOffer'

// The place an offer was seen: a job board, a company site, a message.
export default class Source extends Model {
  static entity = 'sources'

  declare id: string
  declare key: string
  declare label: string
  declare url: string | null

  declare offers: JobOffer[]

  static fields() {
    return {
      id: this.uid(),
      key: this.string(''),
      label: this.string(''),
      url: this.string(null),
      offers: this.hasMany(JobOffer, 'sourceId'),
    }
  }
}
