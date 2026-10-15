import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCardDraft } from '../../src/composables/useCardDraft'
import { Application, JobOffer } from '../../src/models'
import { captureOffer } from '../../src/services/applications'
import { freshStore } from './helpers'

// The draft of a card, with no page around it: the application is found again each time, as the drawer does.
function draftOf(id: string) {
  const find = () =>
    useRepo(Application)
      .with('jobOffer', (query) => query.with('company'))
      .find(id)
  return createCardDraft(find, (path) => path)
}

function newCard() {
  const application = captureOffer({
    title: 'Backend developer',
    companyName: 'Acme',
    url: 'https://example.com/jobs/1',
    location: 'Paris',
    description: 'Build things',
  })
  return application.id
}

describe('the draft of a card', () => {
  beforeEach(() => {
    freshStore()
  })

  it('is not changed while it is a copy of the model', () => {
    const card = draftOf(newCard())
    card.begin()
    expect(card.isDirty.value).toBe(false)
    expect(card.draft.details.title).toBe('Backend developer')
    expect(card.draft.details.company).toBe('Acme')
  })

  it('is changed as soon as one value differs, and not any more when it is put back', () => {
    const card = draftOf(newCard())
    card.begin()
    card.draft.details.title = 'Frontend developer'
    expect(card.isDirty.value).toBe(true)
    card.draft.details.title = 'Backend developer'
    expect(card.isDirty.value).toBe(false)
  })

  it('sees a change of the address, and its being put back', () => {
    const card = draftOf(newCard())
    card.begin()
    card.draft.address.city = 'Lyon'
    expect(card.isDirty.value).toBe(true)
    card.draft.address.city = ''
    expect(card.isDirty.value).toBe(false)
  })

  it('is never changed while the card is only read', () => {
    const id = newCard()
    const card = draftOf(id)
    card.begin()
    card.end()
    useRepo(JobOffer)
      .where('id', useRepo(Application).find(id)?.jobOfferId ?? '')
      .update({ title: 'Changed elsewhere' })
    expect(card.isDirty.value).toBe(false)
  })

  it('writes nothing until it is saved, and what is saved is trimmed', () => {
    const id = newCard()
    const card = draftOf(id)
    card.begin()
    card.draft.details.title = '  Frontend developer  '
    card.draft.details.location = 'Lyon'
    const offer = () => useRepo(Application).with('jobOffer').find(id)?.jobOffer
    expect(offer()?.title).toBe('Backend developer')
    expect(card.save()).toBe(true)
    expect(offer()?.title).toBe('Frontend developer')
    expect(offer()?.location).toBe('Lyon')
  })

  it('drops the draft: the model is as it was', () => {
    const id = newCard()
    const card = draftOf(id)
    card.begin()
    card.draft.details.title = 'Frontend developer'
    card.end()
    card.begin()
    expect(card.draft.details.title).toBe('Backend developer')
    expect(card.isDirty.value).toBe(false)
  })

  it('refuses a salary that makes no sense, writes nothing, and says why', () => {
    const id = newCard()
    const card = draftOf(id)
    card.begin()
    card.draft.details.title = 'Frontend developer'
    card.draft.details.salaryMin = '50000'
    card.draft.details.salaryMax = '40000'
    card.draft.details.salaryCurrency = 'EUR'
    expect(card.save()).toBe(false)
    expect(card.problem.value).toBe('drawer.salaryErrors.order')
    expect(useRepo(Application).with('jobOffer').find(id)?.jobOffer?.title).toBe('Backend developer')
  })

  it('keeps the country of the address when the address is what changed, and the one of the details otherwise', () => {
    const id = newCard()
    const card = draftOf(id)
    const offer = () => useRepo(Application).with('jobOffer').find(id)?.jobOffer
    card.begin()
    card.draft.details.country = 'FR'
    expect(card.save()).toBe(true)
    expect(offer()?.country).toBe('FR')
    card.begin()
    card.draft.address.country = 'DE'
    expect(card.save()).toBe(true)
    expect(offer()?.country).toBe('DE')
  })
})
