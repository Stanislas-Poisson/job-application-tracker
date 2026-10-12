import { Model } from 'pinia-orm'
import Application from './Application'

// Something to do for an application, by a date: follow up, prepare an interview.
export default class Reminder extends Model {
  static entity = 'reminders'

  declare id: string
  declare applicationId: string
  declare title: string
  declare dueAt: string
  declare doneAt: string | null

  declare application: Application | null

  static fields() {
    return {
      id: this.uid(),
      applicationId: this.attr(''),
      title: this.string(''),
      dueAt: this.string(() => new Date().toISOString()),
      doneAt: this.string(null),
      application: this.belongsTo(Application, 'applicationId'),
    }
  }
}
