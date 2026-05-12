// Frame size catalog — single source of truth for sizing data across the app.
// Stored value in DB is `code` (e.g. "S/M"); UI shows `label` and `frame` together.

export const FRAME_SIZES = [
  { code: 'XS',   label: 'XS',         frame: '48cm', minHeight: '4\'11"', maxHeight: '5\'2"'  },
  { code: 'S',    label: 'Small',      frame: '50cm', minHeight: '5\'2"',  maxHeight: '5\'5"'  },
  { code: 'S/M',  label: 'Small/M',    frame: '52cm', minHeight: '5\'5"',  maxHeight: '5\'7"'  },
  { code: 'M',    label: 'Medium',     frame: '54cm', minHeight: '5\'7"',  maxHeight: '5\'10"' },
  { code: 'L',    label: 'Large',      frame: '56cm', minHeight: '5\'10"', maxHeight: '6\'1"'  },
  { code: 'L/XL', label: 'Large/XL',   frame: '58cm', minHeight: '6\'1"',  maxHeight: '6\'3"'  },
  { code: 'XL',   label: 'XL',         frame: '60cm', minHeight: '6\'3"',  maxHeight: '6\'5"'  },
]

export const SIZE_BY_CODE = Object.fromEntries(FRAME_SIZES.map(s => [s.code, s]))

export function getSize(code) {
  return SIZE_BY_CODE[code] || null
}
