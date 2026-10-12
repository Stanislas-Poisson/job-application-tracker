import { Model } from 'pinia-orm'
import Application from './Application'

// A column of the board. The user can add, rename, reorder and remove them.
export default class Status extends Model {
  static entity = 'statuses'

  declare id: string
  declare key: string
  declare label: string
  declare order: number
  declare color: string
  // A final status ends the application: no more reminders are due.
  declare isFinal: boolean

  declare applications: Application[]

  static fields() {
    return {
      id: this.uid(),
      key: this.string(''),
      label: this.string(''),
      order: this.number(0),
      color: this.string('#64748b'),
      isFinal: this.boolean(false),
      applications: this.hasMany(Application, 'statusId'),
    }
  }
}
