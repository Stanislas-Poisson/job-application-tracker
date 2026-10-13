import type { Application, JobOffer } from '../models'
import type { LegMode } from '../models/Journey'
import { UTF8_BOM, plainCell, toCsv } from '../utils/csv'
import {
  type Conversion,
  type Salary,
  type SalaryKind,
  type SalaryPeriod,
  comparableSalary,
  currencyDigits,
  fromMinor,
} from '../utils/money'
import { type AddressParts, formatAddress, normalizeAddress } from './address'
import { describeJourney, preferredOf, totalMeters, totalMinutes } from './journeys'

export const COLUMNS = [
  'status',
  'title',
  'company',
  'finalClient',
  'place',
  'postalAddress',
  'postalCode',
  'city',
  'region',
  'latitude',
  'longitude',
  'commuteMinutes',
  'commuteKm',
  'journey',
  'returnMinutes',
  'country',
  'contract',
  'workMode',
  'source',
  'url',
  'published',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
  'salaryPeriod',
  'salaryKind',
  'homeCurrency',
  'salaryPerYearHome',
  'netPerYear',
  'netProfile',
  'appliedAt',
  'createdAt',
  'updatedAt',
  'priority',
  'favourite',
  'tags',
  'contacts',
  'openReminders',
  'nextReminder',
  'archived',
] as const

export type Column = (typeof COLUMNS)[number]

// The words of the file, in the language of the page.
export interface ExportLabels {
  columns: Record<Column, string>
  yes: string
  no: string
  priorities: Record<string, string>
  periods: Record<SalaryPeriod, string>
  kinds: Record<SalaryKind, string>
  // The names of the means of a leg of a journey.
  legModes: Record<LegMode, string>
}

export interface ExportContext {
  // The language of the file, for the country in the address.
  locale: string
  labels: ExportLabels
  conversion: Conversion
  // The estimate of the net pay of the salary of an offer, per year (the middle of the range), by the profile chosen, or null.
  netEstimate: (salary: Salary) => { amount: number; currency: string; profile: string } | null
  // The names of the final clients of a company (a recruitment firm hires for them).
  finalClients: (companyId: string) => string[]
  // The label of the column an application is in, by the id of its status.
  statusLabel: (statusId: string | null) => string
  sourceLabel: (source: { key: string; label: string }) => string
  // The mark of a decimal number in the file: "." for a comma-separated file, "," for a semicolon-separated one.
  decimal: '.' | ','
}

// An amount in minor units as a plain number the spreadsheet can compute with, with no currency sign and no group
// separator: 4500050 in euros is 45000.50 ("45000,50" in a file that uses the decimal comma).
export function decimalAmount(minor: number | null, currency: string | null, mark: '.' | ','): string {
  if (null === minor || null === currency) {
    return ''
  }
  return fromMinor(minor, currency).toFixed(currencyDigits(currency)).replace('.', mark)
}

const list = (values: string[]): string => values.join('; ')

/**
 * The rows of the file: the head, then one row per application, in the order given.
 *
 * - Moments are in UTC, as they are stored (`2026-10-13T08:00:00.000Z`); the day an offer was published is a plain date.
 * - The salary is as the offer states it (amounts in its currency), and also as one number per year in the home currency
 *   when the rates allow it, so that offers can be sorted and compared in the spreadsheet.
 * - Texts that could run as a formula are made plain (see plainCell).
 */
export function boardRows(applications: Application[], context: ExportContext): string[][] {
  const { labels, conversion, decimal } = context
  const head = COLUMNS.map((column) => labels.columns[column])

  const rows = applications.map((application) => {
    const offer = application.jobOffer
    const currency = offer?.salaryCurrency ?? null
    const salary = {
      min: offer?.salaryMin ?? null,
      max: offer?.salaryMax ?? null,
      currency,
      period: offer?.salaryPeriod ?? null,
      kind: offer?.salaryKind ?? null,
    }
    const perYear = null === currency ? null : comparableSalary(salary, conversion)
    const net = context.netEstimate(salary)
    // The way there and the way back: the journeys the user marked, or the shortest.
    const outbound = preferredOf(offer?.journeys ?? [], 'outbound')
    const back = preferredOf(offer?.journeys ?? [], 'return')
    const outboundMeters = outbound ? totalMeters(outbound.legs) : null
    const waiting = (application.reminders ?? [])
      .filter((reminder) => null === reminder.doneAt)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))

    const cells: Record<Column, string> = {
      status: context.statusLabel(application.statusId),
      title: offer?.title ?? '',
      company: offer?.company?.name ?? '',
      finalClient: offer?.company ? list(context.finalClients(offer.company.id)) : '',
      place: offer?.location ?? '',
      postalAddress: offer ? formatAddress(addressOfOffer(offer), context.locale) : '',
      postalCode: offer?.postalCode ?? '',
      city: offer?.city ?? '',
      region: offer?.region ?? '',
      latitude: null == offer?.latitude ? '' : String(offer.latitude).replace('.', decimal),
      longitude: null == offer?.longitude ? '' : String(offer.longitude).replace('.', decimal),
      commuteMinutes: outbound ? String(totalMinutes(outbound.legs)) : '',
      commuteKm: null == outboundMeters ? '' : String(outboundMeters / 1000).replace('.', decimal),
      journey: outbound ? describeJourney(outbound, (mode) => labels.legModes[mode]) : '',
      returnMinutes: back ? String(totalMinutes(back.legs)) : '',
      country: offer?.country ?? '',
      contract: offer?.contractType ?? '',
      workMode: offer?.workMode ?? '',
      source: offer?.source ? context.sourceLabel(offer.source) : '',
      url: offer?.url ?? '',
      published: offer?.postedOn ?? '',
      salaryMin: decimalAmount(salary.min, currency, decimal),
      salaryMax: decimalAmount(salary.max, currency, decimal),
      salaryCurrency: currency ?? '',
      salaryPeriod: salary.period ? labels.periods[salary.period] : '',
      salaryKind: salary.kind ? labels.kinds[salary.kind] : '',
      homeCurrency: null === perYear ? '' : conversion.home,
      salaryPerYearHome: decimalAmount(perYear, null === perYear ? null : conversion.home, decimal),
      netPerYear: net ? decimalAmount(net.amount, net.currency, decimal) : '',
      netProfile: net?.profile ?? '',
      appliedAt: application.appliedAt ?? '',
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      priority: labels.priorities[String(application.priority)] ?? '',
      favourite: application.isFavorite ? labels.yes : labels.no,
      tags: list((application.tags ?? []).map((tag) => tag.name)),
      contacts: list((application.contacts ?? []).map((contact) => `${contact.firstName} ${contact.lastName}`.trim())),
      openReminders: String(waiting.length),
      nextReminder: waiting[0]?.dueAt ?? '',
      archived: application.archived ? labels.yes : labels.no,
    }
    return COLUMNS.map((column) => plainCell(cells[column]))
  })

  return [head, ...rows]
}

// The file as text, ready to be written: with the mark that makes a spreadsheet read it as UTF-8.
export function boardCsv(
  applications: Application[],
  context: Omit<ExportContext, 'decimal'>,
  separator: ',' | ';'
): string {
  return UTF8_BOM + toCsv(boardRows(applications, { ...context, decimal: ';' === separator ? ',' : '.' }), separator)
}

// A language that writes numbers with a decimal comma gets a file with semicolons, which is what its spreadsheets open.
export function csvSeparator(locale: string): ',' | ';' {
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => 'decimal' === part.type)?.value
  return ',' === decimal ? ';' : ','
}

export const exportFileName = (day: string): string => `job-application-tracker-board-${day}.csv`

// The address of an offer as fields.
export const addressOfOffer = (offer: JobOffer): AddressParts =>
  normalizeAddress({
    line1: offer.addressLine1,
    line2: offer.addressLine2,
    line3: offer.addressLine3,
    postalCode: offer.postalCode,
    city: offer.city,
    region: offer.region,
    country: offer.country,
    latitude: offer.latitude,
    longitude: offer.longitude,
  })
