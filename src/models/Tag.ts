import { Model } from 'pinia-orm'

// A label the user puts on an application, a company, a contact or an exchange, to find them again.
export default class Tag extends Model {
  static entity = 'tags'

  declare id: string
  declare name: string
  // A colour as #rrggbb. It is a help to the eye: the name is always written.
  declare color: string
  declare createdAt: string

  static fields() {
    return {
      id: this.uid(),
      name: this.string(''),
      color: this.string('#0072b2'),
      createdAt: this.string(() => new Date().toISOString()),
    }
  }
}
