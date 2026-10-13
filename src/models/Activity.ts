import { Model } from 'pinia-orm'
import Application from './Application'

export type ActivityType = 'created' | 'status_changed' | 'applied' | 'call' | 'email' | 'interview' | 'other'

// One line of the timeline of an application.
export default class Activity extends Model {
  static entity = 'activities'

  declare id: string
  // When the record last changed (UTC). Set by the persistence; null for a record that was never stamped.
  declare updatedAt: string | null
  declare applicationId: string
  declare type: ActivityType
  declare title: string
  declare fromStatusId: string | null
  declare toStatusId: string | null
  declare occurredAt: string

  declare application: Application | null

  static fields() {
    return {
      id: this.uid(),
      updatedAt: this.string(null),
      applicationId: this.attr(''),
      type: this.string('other'),
      title: this.string(''),
      fromStatusId: this.attr(null),
      toStatusId: this.attr(null),
      occurredAt: this.string(() => new Date().toISOString()),
      application: this.belongsTo(Application, 'applicationId'),
    }
  }
}
