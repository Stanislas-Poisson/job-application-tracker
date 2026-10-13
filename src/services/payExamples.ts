import type { PayLine } from '../models/PayProfile'

// A few profiles to start from. They are **illustrations**, not rules: the rates and the scales change every year, depend on
// the person (family, region, contract, options), and the extension is not an advisor. Load one, check it against an
// official simulator, and edit it; the estimate it gives is never a promise.
export interface PayExample {
  key: string
  name: string
  country: string | null
  status: string
  currency: string
  lines: PayLine[]
  notes: string
}

// The scale of the income tax in France for a single person with one part, as published for the income of 2024 (paid in 2025).
// It is here as an example of the shape of a scale: take the one of the year you need.
const FRANCE_SCALE = [
  { upTo: 11497, rate: 0 },
  { upTo: 29315, rate: 11 },
  { upTo: 83823, rate: 30 },
  { upTo: 180294, rate: 41 },
  { upTo: null, rate: 45 },
]

export const PAY_EXAMPLES: PayExample[] = [
  {
    key: 'fr-not-executive',
    name: 'France - employee, not executive (example)',
    country: 'FR',
    status: 'Employee, not executive',
    currency: 'EUR',
    lines: [
      { label: 'Employee contributions (about 22% of the gross)', base: 'gross', kind: 'rate', rate: 22 },
      {
        label: 'Income tax (single person, one part, on 90% after the flat deduction for expenses)',
        base: 'running',
        kind: 'brackets',
        share: 90,
        brackets: FRANCE_SCALE,
      },
    ],
    notes:
      'An illustration. The contributions vary with the company and the pay; the tax ignores the family, the region and the other income. Check it with the official simulator of your country and edit the lines.',
  },
  {
    key: 'fr-executive',
    name: 'France - employee, executive (example)',
    country: 'FR',
    status: 'Employee, executive',
    currency: 'EUR',
    lines: [
      { label: 'Employee contributions (about 25% of the gross)', base: 'gross', kind: 'rate', rate: 25 },
      {
        label: 'Income tax (single person, one part, on 90% after the flat deduction for expenses)',
        base: 'running',
        kind: 'brackets',
        share: 90,
        brackets: FRANCE_SCALE,
      },
    ],
    notes:
      'An illustration, like the other one, with higher contributions. Check it with the official simulator and edit the lines.',
  },
  {
    key: 'fr-freelance',
    name: 'France - freelance, micro-enterprise (example)',
    country: 'FR',
    status: 'Freelance',
    currency: 'EUR',
    lines: [{ label: 'Social contributions (about 22% of the turnover)', base: 'gross', kind: 'rate', rate: 22 }],
    notes:
      'An illustration for a self-employed person under the micro regime: only the social contributions, on the turnover. The income tax depends on the option chosen and on the household, and is left out. Edit it to your situation. Used by the freelance rate helper with the turnover as the gross.',
  },
  {
    key: 'flat',
    name: 'Flat rate (example)',
    country: null,
    status: 'Any',
    currency: 'EUR',
    lines: [{ label: 'Contributions and taxes (a guess of 25%)', base: 'gross', kind: 'rate', rate: 25 }],
    notes: 'The simplest profile: one rate on the gross. Replace 25 by what you know of your situation.',
  },
]
