import { SALARY_KINDS, SALARY_PERIODS, type SalaryKind, type SalaryPeriod, isCurrency, toMinor } from '../utils/money'

// What a form holds. A number field gives a number, the others give texts. Empty means not set.
export interface SalaryForm {
  min: string | number | null
  max: string | number | null
  currency: string
  period: string
  kind: string
}

const text = (value: string | number | null): string => (null === value ? '' : String(value).trim())

export interface SalaryFields {
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  salaryPeriod: SalaryPeriod | null
  salaryKind: SalaryKind | null
}

// A form that cannot become a salary. The code is the key of the message to show.
export class SalaryError extends Error {
  constructor(public readonly code: 'currencyRequired' | 'amount' | 'order' | 'period' | 'kind') {
    super(code)
  }
}

// The fields of the offer, from the form. Amounts become minor units of the currency.
export function salaryFromForm(form: SalaryForm): SalaryFields {
  const empty = '' === text(form.min) && '' === text(form.max)
  const currency = '' === form.currency ? null : form.currency
  if (null !== currency && !isCurrency(currency)) {
    throw new SalaryError('currencyRequired')
  }
  if (empty) {
    return { salaryMin: null, salaryMax: null, salaryCurrency: currency, salaryPeriod: null, salaryKind: null }
  }
  if (null === currency) {
    throw new SalaryError('currencyRequired')
  }

  const amount = (value: string | number | null): number | null => {
    if ('' === text(value)) {
      return null
    }
    let minor: number
    try {
      minor = toMinor(text(value), currency)
    } catch {
      throw new SalaryError('amount')
    }
    if (0 > minor) {
      throw new SalaryError('amount')
    }
    return minor
  }

  const salaryMin = amount(form.min)
  const salaryMax = amount(form.max)
  if (null !== salaryMin && null !== salaryMax && salaryMin > salaryMax) {
    throw new SalaryError('order')
  }
  if ('' !== form.period && !(SALARY_PERIODS as readonly string[]).includes(form.period)) {
    throw new SalaryError('period')
  }
  if ('' !== form.kind && !(SALARY_KINDS as readonly string[]).includes(form.kind)) {
    throw new SalaryError('kind')
  }

  return {
    salaryMin,
    salaryMax,
    salaryCurrency: currency,
    salaryPeriod: '' === form.period ? null : (form.period as SalaryPeriod),
    salaryKind: '' === form.kind ? null : (form.kind as SalaryKind),
  }
}
