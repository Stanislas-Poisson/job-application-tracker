import { Model } from 'pinia-orm'
import Application from './Application'

// Something to do for an application, by a date: follow up, prepare an interview.
export default class Reminder extends Model {
  static entity = 'reminders'

  declare id: string
  // When the record last changed (UTC). Set by the persistence; null for a record that was never stamped.
  declare updatedAt: string | null
  declare applicationId: string
  declare title: string
  declare dueAt: string
  declare doneAt: string | null

  declare application: Application | null

  static fields() {
    return {
      id: this.uid(),
      updatedAt: this.string(null),
      applicationId: this.attr(''),
      title: this.string(''),
      dueAt: this.string(() => new Date().toISOString()),
      doneAt: this.string(null),
      application: this.belongsTo(Application, 'applicationId'),
    }
  }
}
