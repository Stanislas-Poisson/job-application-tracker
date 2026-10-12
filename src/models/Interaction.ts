import { Model } from 'pinia-orm'
import Application from './Application'
import Contact from './Contact'
import Tag from './Tag'
import Taggable from './Taggable'

export const CHANNELS = ['email', 'linkedin', 'phone', 'sms', 'whatsapp', 'video', 'in_person', 'other'] as const
export const DIRECTIONS = ['inbound', 'outbound'] as const
export const ORIGINS = ['manual', 'paste', 'eml', 'file'] as const

export type Channel = (typeof CHANNELS)[number]
export type Direction = (typeof DIRECTIONS)[number]
export type Origin = (typeof ORIGINS)[number]

// An exchange with someone: an email, a message on LinkedIn, a call, an interview. What was said is kept as it was.
export default class Interaction extends Model {
  static entity = 'interactions'

  declare id: string
  declare applicationId: string | null
  // The contact it was with, when the extension knows the person.
  declare contactId: string | null
  // Who it was with, as the message gave it ("Ada Lovelace <ada@example.com>"), when no contact matches.
  declare counterpart: string | null
  declare channel: Channel
  // Received from the other person, or sent to them.
  declare direction: Direction
  declare subject: string | null
  declare body: string | null
  // When it happened, in UTC.
  declare occurredAt: string
  // For a call or a meeting.
  declare durationMinutes: number | null
  // What identifies it where it comes from (the Message-ID of an email, the address of a conversation): an exchange
  // imported twice is kept once.
  declare externalRef: string | null
  declare origin: Origin
  declare createdAt: string

  declare application: Application | null
  declare contact: Contact | null
  declare tags: Tag[]

  static fields() {
    return {
      id: this.uid(),
      applicationId: this.attr(null),
      contactId: this.attr(null),
      counterpart: this.string(null),
      channel: this.string('other'),
      direction: this.string('inbound'),
      subject: this.string(null),
      body: this.string(null),
      occurredAt: this.string(() => new Date().toISOString()),
      durationMinutes: this.number(null),
      externalRef: this.string(null),
      origin: this.string('manual'),
      createdAt: this.string(() => new Date().toISOString()),
      application: this.belongsTo(Application, 'applicationId'),
      contact: this.belongsTo(Contact, 'contactId'),
      tags: this.morphToMany(Tag, Taggable, 'tagId', 'taggableId', 'taggableType'),
    }
  }
}
