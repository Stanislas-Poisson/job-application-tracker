import type { Model } from 'pinia-orm'
import Activity from './Activity'
import Application from './Application'
import ApplicationContact from './ApplicationContact'
import Company from './Company'
import CompanyRelation from './CompanyRelation'
import Contact from './Contact'
import ContactCompany from './ContactCompany'
import ContactMethod from './ContactMethod'
import Interaction from './Interaction'
import JobOffer from './JobOffer'
import Note from './Note'
import PayProfile from './PayProfile'
import Reminder from './Reminder'
import Source from './Source'
import Status from './Status'
import Tag from './Tag'
import Taggable from './Taggable'
import Trash from './Trash'

export {
  Activity,
  Application,
  ApplicationContact,
  Company,
  CompanyRelation,
  Contact,
  ContactCompany,
  ContactMethod,
  Interaction,
  JobOffer,
  Note,
  PayProfile,
  Reminder,
  Source,
  Status,
  Tag,
  Taggable,
  Trash,
}

// Every model that is stored. The persistence saves and loads these, one storage key per model.
export const MODELS: (typeof Model)[] = [
  Company,
  CompanyRelation,
  Source,
  JobOffer,
  Status,
  Application,
  Contact,
  ContactCompany,
  ContactMethod,
  ApplicationContact,
  Note,
  Activity,
  Interaction,
  PayProfile,
  Reminder,
  Tag,
  Taggable,
  Trash,
]
