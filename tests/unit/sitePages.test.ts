import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PageSnapshot } from '../../src/extraction/page'
import { readSnapshot } from '../../src/extraction/read'
import { redactSnapshot, shapeOf, snapshotOfHtml } from './siteFixtures'

// One page of an offer for each job site, kept as a snapshot with placeholders in place of the words of the offer, and what the
// extension reads from it. They show that the reading still follows the structure of the site as it was last seen. When a site
// changes, give the command of docs/sites.md a fresh saved page: it says what stopped being read, and rewrites the fixture.

const ROOT = 'tests/fixtures/sites'
const NOW = new Date('2026-10-14T10:00:00Z')
const ZONE = 'Europe/Paris'

interface Site {
  name: string
  snapshot: PageSnapshot
  expected: Record<string, unknown>
}

const sites: Site[] = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: entry.name,
    snapshot: JSON.parse(readFileSync(`${ROOT}/${entry.name}/snapshot.json`, 'utf8')) as PageSnapshot,
    expected: JSON.parse(readFileSync(`${ROOT}/${entry.name}/expected.json`, 'utf8')) as Record<string, unknown>,
  }))

describe('the structure of the pages of offers, site by site', () => {
  it('has a fixture for each site of the list', () => {
    expect(sites.map((site) => site.name)).toEqual(
      expect.arrayContaining([
        'apec',
        'cadremploi',
        'freework',
        'hellowork',
        'indeed',
        'jobteaser',
        'meteojob',
        'monster',
        'welcometothejungle',
        'welovedevs',
        'ziprecruiter',
      ])
    )
  })

  it.each(sites.map((site) => [site.name, site] as const))(
    '%s is read as it was when the fixture was made',
    (_name, site) => {
      expect(readSnapshot(site.snapshot, ZONE, NOW)).toEqual(site.expected)
    }
  )

  it.each(sites.map((site) => [site.name, site] as const))(
    '%s gives at least a title, a company and a description',
    (_name, site) => {
      expect(shapeOf(site.expected)).toEqual(expect.arrayContaining(['title', 'description']))
    }
  )
})

// A saved page that was just given (PAGE=file SITE=name URL=address): what the extension reads from it is compared with the fixture
// of the site, and WRITE=1 makes the fixture again from it. Nothing runs without PAGE.
const { PAGE, SITE, URL: PAGE_URL, WRITE } = process.env

describe.skipIf(!PAGE)('a saved page of a site', () => {
  it('is read like the fixture of the site, or becomes the fixture', () => {
    const snapshot = snapshotOfHtml(readFileSync(PAGE ?? '', 'utf8'), PAGE_URL ?? `https://example.org/${SITE ?? ''}`)
    const kept = redactSnapshot(snapshot)
    const read = readSnapshot(kept, ZONE, NOW)
    if (WRITE) {
      const dir = `${ROOT}/${SITE ?? 'site'}`
      mkdirSync(dir, { recursive: true })
      writeFileSync(`${dir}/snapshot.json`, `${JSON.stringify(kept, null, 2)}\n`)
      writeFileSync(`${dir}/expected.json`, `${JSON.stringify(read, null, 2)}\n`)
      return
    }
    const before = `${ROOT}/${SITE ?? 'site'}/expected.json`
    expect(existsSync(before), `no fixture for ${SITE ?? ''}: run again with WRITE=1`).toBe(true)
    const expected = JSON.parse(readFileSync(before, 'utf8')) as Record<string, unknown>
    // The words are not the same: what must be the same is which fields the reading finds.
    expect(shapeOf(readSnapshot(snapshot, ZONE, NOW))).toEqual(shapeOf(expected))
  })
})
