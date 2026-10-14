import { beforeEach, describe, expect, it } from 'vitest'
import { applicationIdOf, cardOf, isTyping, moveOfKey, neighbour, neighbourColumn } from '../../src/services/boardKeys'

// Three columns: two cards, none, one.
beforeEach(() => {
  const card = (id: string) =>
    `<article class="application-card" data-application="${id}"><button class="card-open" id="${id}">${id}</button></article>`
  document.body.innerHTML = `
    <section class="column" data-status="s1">${card('a1')}${card('a2')}</section>
    <section class="column" data-status="s2"></section>
    <section class="column" data-status="s3">${card('c1')}</section>
    <input id="field"><select id="choice"></select>`
})

const card = (id: string) => document.getElementById(id) as HTMLElement

describe('the key of an arrow', () => {
  it('goes to the previous or next column by what is on the screen, and the other way round from right to left', () => {
    expect(moveOfKey('ArrowLeft', false)).toBe('previous')
    expect(moveOfKey('ArrowRight', false)).toBe('next')
    expect(moveOfKey('ArrowLeft', true)).toBe('next')
    expect(moveOfKey('ArrowRight', true)).toBe('previous')
  })

  it('keeps up and down as they are, and ignores any other key', () => {
    expect(moveOfKey('ArrowUp', true)).toBe('up')
    expect(moveOfKey('ArrowDown', false)).toBe('down')
    expect(moveOfKey('a', false)).toBeNull()
  })
})

describe('the card to go to', () => {
  it('stays in the column for up and down, and stops at the ends', () => {
    expect(neighbour(card('a1'), 'down')).toBe(card('a2'))
    expect(neighbour(card('a2'), 'up')).toBe(card('a1'))
    expect(neighbour(card('a1'), 'up')).toBeNull()
    expect(neighbour(card('a2'), 'down')).toBeNull()
  })

  it('skips a column with no card for the sides, at the same height or the last one there is', () => {
    expect(neighbour(card('a1'), 'next')).toBe(card('c1'))
    expect(neighbour(card('a2'), 'next')).toBe(card('c1'))
    expect(neighbour(card('c1'), 'previous')).toBe(card('a1'))
  })

  it('goes nowhere past the first or the last column', () => {
    expect(neighbour(card('a1'), 'previous')).toBeNull()
    expect(neighbour(card('c1'), 'next')).toBeNull()
  })
})

describe('the column a card moves to', () => {
  it('is the next one even when it has no card, and none past the edge', () => {
    expect(neighbourColumn(card('a1'), 'next')?.dataset.status).toBe('s2')
    expect(neighbourColumn(card('c1'), 'previous')?.dataset.status).toBe('s2')
    expect(neighbourColumn(card('a1'), 'previous')).toBeNull()
    expect(neighbourColumn(card('c1'), 'next')).toBeNull()
  })
})

describe('what the keys read from the page', () => {
  it('finds the card of a target and the application it belongs to', () => {
    expect(cardOf(card('a2'))).toBe(card('a2'))
    expect(cardOf(document.getElementById('field'))).toBeNull()
    expect(cardOf(null)).toBeNull()
    expect(applicationIdOf(card('c1'))).toBe('c1')
  })

  it('knows a person is typing or choosing, where the keys are not for the page', () => {
    expect(isTyping(document.getElementById('field'))).toBe(true)
    expect(isTyping(document.getElementById('choice'))).toBe(true)
    expect(isTyping(card('a1'))).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
})
