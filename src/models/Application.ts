import { Model } from 'pinia-orm'
import Activity from './Activity'
import ApplicationContact from './ApplicationContact'
import Contact from './Contact'
import Interaction from './Interaction'
import JobOffer from './JobOffer'
import Note from './Note'
import Reminder from './Reminder'
import Status from './Status'
import Tag from './Tag'
import Taggable from './Taggable'

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
  // A mark to find it again, and how much it matters: 0 none, 1 low, 2 medium, 3 high.
  declare isFavorite: boolean
  declare priority: number
  declare createdAt: string
  declare updatedAt: string

  declare jobOffer: JobOffer | null
  declare status: Status | null
  declare contacts: Contact[]
  declare notes: Note[]
  declare activities: Activity[]
  declare interactions: Interaction[]
  declare reminders: Reminder[]
  declare tags: Tag[]

  static fields() {
    return {
      id: this.uid(),
      jobOfferId: this.attr(null),
      statusId: this.attr(null),
      position: this.number(0),
      appliedAt: this.string(null),
      archived: this.boolean(false),
      isFavorite: this.boolean(false),
      priority: this.number(0),
      createdAt: this.string(() => new Date().toISOString()),
      updatedAt: this.string(() => new Date().toISOString()),
      jobOffer: this.belongsTo(JobOffer, 'jobOfferId'),
      status: this.belongsTo(Status, 'statusId'),
      contacts: this.belongsToMany(Contact, ApplicationContact, 'applicationId', 'contactId'),
      notes: this.morphMany(Note, 'noteableId', 'noteableType'),
      activities: this.hasMany(Activity, 'applicationId'),
      interactions: this.hasMany(Interaction, 'applicationId'),
      reminders: this.hasMany(Reminder, 'applicationId'),
      tags: this.morphToMany(Tag, Taggable, 'tagId', 'taggableId', 'taggableType'),
    }
  }
}
