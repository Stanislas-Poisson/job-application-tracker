import { Model } from 'pinia-orm'
import Application from './Application'
import Company from './Company'
import Source from './Source'

export type WorkMode = 'onsite' | 'hybrid' | 'remote'

// A job offer, as it was published. The user may apply to it several times, hence the list of applications.
export default class JobOffer extends Model {
  static entity = 'jobOffers'

  declare id: string
  declare companyId: string | null
  declare sourceId: string | null
  declare title: string
  declare url: string | null
  declare location: string | null
  declare contractType: string | null
  declare workMode: WorkMode | null
  declare salaryMin: number | null
  declare salaryMax: number | null
  declare currency: string | null
  declare description: string | null
  declare postedAt: string | null
  declare capturedAt: string

  declare company: Company | null
  declare source: Source | null
  declare applications: Application[]

  static fields() {
    return {
      id: this.uid(),
      companyId: this.attr(null),
      sourceId: this.attr(null),
      title: this.string(''),
      url: this.string(null),
      location: this.string(null),
      contractType: this.string(null),
      workMode: this.string(null),
      salaryMin: this.number(null),
      salaryMax: this.number(null),
      currency: this.string(null),
      description: this.string(null),
      postedAt: this.string(null),
      capturedAt: this.string(() => new Date().toISOString()),
      company: this.belongsTo(Company, 'companyId'),
      source: this.belongsTo(Source, 'sourceId'),
      applications: this.hasMany(Application, 'jobOfferId'),
    }
  }
}
