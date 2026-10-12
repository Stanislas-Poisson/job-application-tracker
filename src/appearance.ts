import type { Accent, Settings, Vision } from './settings'

// The colours of an accent are in assets/main.scss. Here is what the pages need to draw their choices.
export const ACCENT_SWATCHES: Record<Accent, string> = {
  slate: '#475569',
  blue: '#2563eb',
  teal: '#0d9488',
  green: '#16a34a',
  purple: '#7c3aed',
  pink: '#db2777',
  orange: '#ea580c',
}

// The palette of Okabe and Ito, made to be told apart by people with the usual kinds of colour blindness.
export const COLOUR_BLIND_PALETTE = [
  '#0072b2',
  '#e69f00',
  '#009e73',
  '#cc79a7',
  '#56b4e9',
  '#d55e00',
  '#f0e442',
  '#000000',
]

// A shape for each column, so that the colour is never the only way to tell them apart.
export const SHAPES = ['●', '■', '▲', '◆', '★', '▼', '⬟', '✚']

// The colour of a column. The one the user chose, or one of the palette in a colour-blind mode.
export function statusColor(chosen: string, index: number, vision: Vision): string {
  if ('red-green' === vision || 'blue-yellow' === vision) {
    return COLOUR_BLIND_PALETTE[index % COLOUR_BLIND_PALETTE.length] ?? chosen
  }
  return chosen
}

// The shape of a column, only in the modes that are made for people who cannot rely on the colour.
export function statusShape(index: number, vision: Vision): string {
  return 'standard' === vision ? '' : (SHAPES[index % SHAPES.length] ?? '')
}

// Writes the choices on the root element: the style sheet answers to these attributes.
export function applyAppearance(root: HTMLElement, settings: Pick<Settings, 'theme' | 'accent' | 'vision'>) {
  if ('auto' === settings.theme) {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', settings.theme)
  }
  root.setAttribute('data-accent', settings.accent)
  root.setAttribute('data-vision', settings.vision)
}
