import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installFieldErrors } from '../../src/app/fieldErrors'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function alert(text: string) {
  const element = document.createElement('p')
  element.className = 'error'
  element.setAttribute('role', 'alert')
  element.textContent = text
  return element
}

describe('a message of error tied to its field', () => {
  beforeAll(() => installFieldErrors())
  beforeEach(() => {
    document.body.innerHTML = `<form><input name="name"><input name="other"><button type="submit">Add</button></form><p id="outside"></p>`
  })

  it('describes the control the user was in, and marks it as invalid', async () => {
    const form = document.querySelector('form') as HTMLFormElement
    const other = document.querySelector('input[name=other]') as HTMLInputElement
    other.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    const message = alert('This name is taken.')
    form.append(message)
    await tick()

    expect(other.getAttribute('aria-describedby')).toBe(message.id)
    expect(other.getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('input[name=name]')?.hasAttribute('aria-describedby')).toBe(false)
  })

  it('falls back on the control just before the message when none had the focus', async () => {
    document.body.innerHTML = `<section><input name="first"><input name="second"></section>`
    const message = alert('Wrong.')
    document.querySelector('section')?.append(message)
    await tick()

    expect(document.querySelector('input[name=second]')?.getAttribute('aria-describedby')).toBe(message.id)
    expect(document.querySelector('input[name=first]')?.hasAttribute('aria-describedby')).toBe(false)
  })

  it('keeps what the control already had, and gives it back when the message goes', async () => {
    const form = document.querySelector('form') as HTMLFormElement
    const field = document.querySelector('input[name=name]') as HTMLInputElement
    field.setAttribute('aria-describedby', 'hint')
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    const message = alert('Too long.')
    form.append(message)
    await tick()
    expect(field.getAttribute('aria-describedby')).toBe(`hint ${message.id}`)

    message.remove()
    await tick()
    expect(field.getAttribute('aria-describedby')).toBe('hint')
    expect(field.getAttribute('aria-invalid')).toBe('true')
  })

  it('leaves the invalid mark off a control once its last message is gone', async () => {
    const form = document.querySelector('form') as HTMLFormElement
    const field = document.querySelector('input[name=name]') as HTMLInputElement
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    const message = alert('Nope.')
    form.append(message)
    await tick()
    message.remove()
    await tick()

    expect(field.hasAttribute('aria-describedby')).toBe(false)
    expect(field.hasAttribute('aria-invalid')).toBe(false)
  })

  it('does nothing for a message that is not an alert of error', async () => {
    const form = document.querySelector('form') as HTMLFormElement
    const note = document.createElement('p')
    note.className = 'muted'
    note.setAttribute('role', 'alert')
    form.append(note)
    await tick()

    expect(document.querySelector('[aria-describedby]')).toBeNull()
  })
})
