import { Model } from 'pinia-orm'
import Application from './Application'

// A column of the board. The user can add, rename, reorder and remove them.
export default class Status extends Model {
  static entity = 'statuses'

  declare id: string
  // When the record last changed (UTC). Set by the persistence; null for a record that was never stamped.
  declare updatedAt: string | null
  declare key: string
  declare label: string
  declare order: number
  declare color: string
  // A symbol of the user's, shown in front of the name (see services/symbol.ts).
  declare symbol: string | null
  // A final status ends the application: no more reminders are due.
  declare isFinal: boolean

  declare applications: Application[]

  static fields() {
    return {
      id: this.uid(),
      updatedAt: this.string(null),
      key: this.string(''),
      label: this.string(''),
      order: this.number(0),
      color: this.string('#64748b'),
      symbol: this.string(null),
      isFinal: this.boolean(false),
      applications: this.hasMany(Application, 'statusId'),
    }
  }
}
