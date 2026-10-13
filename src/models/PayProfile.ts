import { Model } from 'pinia-orm'

// A rule of a pay profile. Lines are taken in order, each from a base:
//   - "gross": the gross pay of the year;
//   - "running": what is left of it after the lines before (for a tax that is taken after the contributions).
// and each is either a flat `rate` (a percentage) or `brackets`: a progressive scale, like an income tax, where each
// slice of the base up to `upTo` (per year, null for no limit) is taken at its own percentage.
export interface PayLine {
  label: string
  base: 'gross' | 'running'
  kind: 'rate' | 'brackets'
  rate?: number
  // The part of the base the line applies to, in percent (100 when missing): a tax that is taken on 90% of the pay after a
  // flat deduction, for instance.
  share?: number
  brackets?: { upTo: number | null; rate: number }[]
}

// How the net pay of a gross pay is estimated: the contributions and the taxes of a country and a status, as the user
// writes them. The rules depend on the country, the year and the person, so a profile is data the user owns and edits,
// not rules inside the extension. Its result is an estimate, never a promise.
export default class PayProfile extends Model {
  static entity = 'payProfiles'

  declare id: string
  // When the record last changed (UTC). Set by the persistence; null for a record that was never stamped.
  declare updatedAt: string | null
  declare name: string
  // The ISO 3166-1 country it is for, and the status in it (executive, not executive, freelance…), as text.
  declare country: string | null
  declare status: string | null
  // The ISO 4217 currency of the amounts of the brackets, and of the pay it applies to.
  declare currency: string
  declare lines: PayLine[]
  declare notes: string | null

  static fields() {
    return {
      id: this.uid(),
      updatedAt: this.string(null),
      name: this.string(''),
      country: this.string(null),
      status: this.string(null),
      currency: this.string('EUR'),
      lines: this.attr(() => []),
      notes: this.string(null),
    }
  }
}
