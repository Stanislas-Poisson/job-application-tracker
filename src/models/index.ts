import type { Model } from 'pinia-orm'
import Activity from './Activity'
import Application from './Application'
import ApplicationContact from './ApplicationContact'
import Company from './Company'
import Contact from './Contact'
import ContactMethod from './ContactMethod'
import Interaction from './Interaction'
import JobOffer from './JobOffer'
import Note from './Note'
import Reminder from './Reminder'
import Source from './Source'
import Status from './Status'

export {
  Activity,
  Application,
  ApplicationContact,
  Company,
  Contact,
  ContactMethod,
  Interaction,
  JobOffer,
  Note,
  Reminder,
  Source,
  Status,
}

// Every model that is stored. The persistence saves and loads these, one storage key per model.
export const MODELS: (typeof Model)[] = [
  Company,
  Source,
  JobOffer,
  Status,
  Application,
  Contact,
  ContactMethod,
  ApplicationContact,
  Note,
  Activity,
  Interaction,
  Reminder,
]
