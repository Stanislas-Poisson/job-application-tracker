import { Model } from 'pinia-orm'
import type { SalaryKind, SalaryPeriod } from '../utils/money'
import Application from './Application'
import Company from './Company'
import Journey from './Journey'
import Source from './Source'

export type WorkMode = 'onsite' | 'hybrid' | 'remote'

// A job offer, as it was published. The user may apply to it several times, hence the list of applications.
export default class JobOffer extends Model {
  static entity = 'jobOffers'

  declare id: string
  // When the record last changed (UTC). Set by the persistence; null for a record that was never stamped.
  declare updatedAt: string | null
  declare companyId: string | null
  declare sourceId: string | null
  declare title: string
  declare url: string | null
  // The place as the offer says it, and its ISO 3166-1 country when it is known.
  declare location: string | null
  declare country: string | null
  // The postal address of the workplace, in fields (the country is the one above). The coordinates are those of the page or
  // pasted by the user from a map: nothing is looked up.
  declare addressLine1: string | null
  declare addressLine2: string | null
  declare addressLine3: string | null
  declare postalCode: string | null
  declare city: string | null
  declare region: string | null
  declare latitude: number | null
  declare longitude: number | null
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
  declare journeys: Journey[]

  static fields() {
    return {
      id: this.uid(),
      updatedAt: this.string(null),
      companyId: this.attr(null),
      sourceId: this.attr(null),
      title: this.string(''),
      url: this.string(null),
      location: this.string(null),
      country: this.string(null),
      addressLine1: this.string(null),
      addressLine2: this.string(null),
      addressLine3: this.string(null),
      postalCode: this.string(null),
      city: this.string(null),
      region: this.string(null),
      latitude: this.number(null),
      longitude: this.number(null),
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
      journeys: this.hasMany(Journey, 'jobOfferId'),
    }
  }
}
