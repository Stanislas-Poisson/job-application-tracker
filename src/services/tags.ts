import { useRepo } from 'pinia-orm'
import { COLOUR_BLIND_PALETTE } from '../appearance'
import { Application, Company, Contact, Interaction, Tag, Taggable } from '../models'
import type { TaggableType } from '../models/Taggable'

// A tag that cannot be made. The code is the key of the message to show.
export class TagError extends Error {
  constructor(public readonly code: 'name' | 'color' | 'tag' | 'target' | 'priority') {
    super(code)
  }
}

export const PRIORITIES = [0, 1, 2, 3] as const
export type Priority = (typeof PRIORITIES)[number]

const COLOR = /^#[0-9a-f]{6}$/i

// Two names are the same tag when they differ only by the case, the accents or the spaces around.
const sameName = (a: string, b: string) =>
  a.trim().normalize('NFC').toLocaleLowerCase() === b.trim().normalize('NFC').toLocaleLowerCase()

const REPOS = {
  applications: Application,
  companies: Company,
  contacts: Contact,
  interactions: Interaction,
} as const

function assertTarget(type: TaggableType, id: string) {
  const repo = REPOS[type]
  if (!repo || !useRepo(repo as typeof Application).find(id)) {
    throw new TagError('target')
  }
}

// A new tag takes the next colour of a palette that stays readable with the usual kinds of colour blindness.
const nextColor = () => COLOUR_BLIND_PALETTE[useRepo(Tag).all().length % COLOUR_BLIND_PALETTE.length] ?? '#0072b2'

// The tag with that name, or a new one. A name that is only spaces is refused.
export function createTag(name: string, color?: string): Tag {
  const text = name.trim()
  if ('' === text) {
    throw new TagError('name')
  }
  if (color !== undefined && !COLOR.test(color)) {
    throw new TagError('color')
  }
  const existing = useRepo(Tag)
    .all()
    .find((tag) => sameName(tag.name, text))
  return existing ?? useRepo(Tag).save({ name: text, color: (color ?? nextColor()).toLowerCase() })
}

export function renameTag(tagId: string, name: string) {
  const text = name.trim()
  if ('' === text) {
    throw new TagError('name')
  }
  const clash = useRepo(Tag)
    .all()
    .find((tag) => tag.id !== tagId && sameName(tag.name, text))
  if (clash) {
    throw new TagError('name')
  }
  useRepo(Tag).where('id', tagId).update({ name: text })
}

export function recolorTag(tagId: string, color: string) {
  if (!COLOR.test(color)) {
    throw new TagError('color')
  }
  useRepo(Tag).where('id', tagId).update({ color: color.toLowerCase() })
}

// Removes a tag, and the links that put it on things. The things themselves stay.
export function deleteTag(tagId: string) {
  useRepo(Taggable).where('tagId', tagId).delete()
  useRepo(Tag).destroy(tagId)
}

// Puts a tag on something. Putting it twice changes nothing.
export function tagEntity(type: TaggableType, id: string, tagId: string) {
  assertTarget(type, id)
  if (!useRepo(Tag).find(tagId)) {
    throw new TagError('tag')
  }
  const already = useRepo(Taggable).where('tagId', tagId).where('taggableId', id).where('taggableType', type).first()
  return already ?? useRepo(Taggable).save({ tagId, taggableId: id, taggableType: type })
}

// Puts a tag on something by its name: the tag is made when it does not exist yet.
export function tagEntityByName(type: TaggableType, id: string, name: string) {
  assertTarget(type, id)
  return tagEntity(type, id, createTag(name).id)
}

export function untagEntity(type: TaggableType, id: string, tagId: string) {
  useRepo(Taggable).where('tagId', tagId).where('taggableId', id).where('taggableType', type).delete()
}

// How many things carry a tag.
export const tagUsage = (tagId: string): number => useRepo(Taggable).where('tagId', tagId).get().length

// Turns the star of an application, a company or a contact.
export function toggleFavorite(type: 'applications' | 'companies' | 'contacts', id: string): boolean {
  assertTarget(type, id)
  const repo = useRepo(REPOS[type] as typeof Application)
  const current = repo.find(id)?.isFavorite ?? false
  repo.where('id', id).update({ isFavorite: !current })
  return !current
}

// How much an application matters: 0 none, 1 low, 2 medium, 3 high.
export function setPriority(applicationId: string, priority: number) {
  if (!(PRIORITIES as readonly number[]).includes(priority)) {
    throw new TagError('priority')
  }
  assertTarget('applications', applicationId)
  useRepo(Application).where('id', applicationId).update({ priority })
}
