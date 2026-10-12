import { Model } from 'pinia-orm'

// A free note. It belongs to whatever noteableType and noteableId point at: a company, a contact, an application.
export default class Note extends Model {
  static entity = 'notes'

  declare id: string
  declare noteableId: string
  declare noteableType: string
  declare body: string
  declare createdAt: string
  declare updatedAt: string

  static fields() {
    return {
      id: this.uid(),
      noteableId: this.attr(''),
      noteableType: this.string(''),
      body: this.string(''),
      createdAt: this.string(() => new Date().toISOString()),
      updatedAt: this.string(() => new Date().toISOString()),
    }
  }
}
