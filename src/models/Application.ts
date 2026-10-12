import { Model } from 'pinia-orm'
import Activity from './Activity'
import ApplicationContact from './ApplicationContact'
import Contact from './Contact'
import JobOffer from './JobOffer'
import Note from './Note'
import Reminder from './Reminder'
import Status from './Status'

// The follow-up of one candidacy to one offer: where it stands and everything that happened.
export default class Application extends Model {
  static entity = 'applications'

  declare id: string
  declare jobOfferId: string | null
  declare statusId: string | null
  // The place in its column on the board, smallest first.
  declare position: number
  declare appliedAt: string | null
  declare archived: boolean
  declare createdAt: string
  declare updatedAt: string

  declare jobOffer: JobOffer | null
  declare status: Status | null
  declare contacts: Contact[]
  declare notes: Note[]
  declare activities: Activity[]
  declare reminders: Reminder[]

  static fields() {
    return {
      id: this.uid(),
      jobOfferId: this.attr(null),
      statusId: this.attr(null),
      position: this.number(0),
      appliedAt: this.string(null),
      archived: this.boolean(false),
      createdAt: this.string(() => new Date().toISOString()),
      updatedAt: this.string(() => new Date().toISOString()),
      jobOffer: this.belongsTo(JobOffer, 'jobOfferId'),
      status: this.belongsTo(Status, 'statusId'),
      contacts: this.belongsToMany(Contact, ApplicationContact, 'applicationId', 'contactId'),
      notes: this.morphMany(Note, 'noteableId', 'noteableType'),
      activities: this.hasMany(Activity, 'applicationId'),
      reminders: this.hasMany(Reminder, 'applicationId'),
    }
  }
}
