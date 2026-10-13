import { Model } from 'pinia-orm'

// What can carry a tag: the entity name of the model.
export const TAGGABLE_TYPES = ['applications', 'companies', 'contacts', 'interactions'] as const
export type TaggableType = (typeof TAGGABLE_TYPES)[number]

// The link between a tag and what carries it. One tag can be on many things, one thing can have many tags.
export default class Taggable extends Model {
  static entity = 'taggables'

  declare id: string
  // When the record last changed (UTC). Set by the persistence; null for a record that was never stamped.
  declare updatedAt: string | null
  declare tagId: string
  declare taggableId: string
  declare taggableType: TaggableType

  static fields() {
    return {
      id: this.uid(),
      updatedAt: this.string(null),
      tagId: this.attr(''),
      taggableId: this.attr(''),
      taggableType: this.string('applications'),
    }
  }
}
