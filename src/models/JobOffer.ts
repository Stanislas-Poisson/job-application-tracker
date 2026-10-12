import { Model } from 'pinia-orm'
import type { SalaryKind, SalaryPeriod } from '../utils/money'
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
  // The salary: a range in minor units (cents), its currency (ISO 4217), its period and whether it is gross or net.
  declare salaryMin: number | null
  declare salaryMax: number | null
  declare salaryCurrency: string | null
  declare salaryPeriod: SalaryPeriod | null
  declare salaryKind: SalaryKind | null
  declare description: string | null
  // The day the offer was published, as a plain date (YYYY-MM-DD): it has no hour and never moves.
  declare postedOn: string | null
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
      salaryCurrency: this.string(null),
      salaryPeriod: this.string(null),
      salaryKind: this.string(null),
      description: this.string(null),
      postedOn: this.string(null),
      capturedAt: this.string(() => new Date().toISOString()),
      company: this.belongsTo(Company, 'companyId'),
      source: this.belongsTo(Source, 'sourceId'),
      applications: this.hasMany(Application, 'jobOfferId'),
    }
  }
}
