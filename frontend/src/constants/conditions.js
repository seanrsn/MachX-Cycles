// Condition catalog — single source of truth for pre-owned bike grading.
// `code` is the value stored in DB (bikes.condition_grade).

export const CONDITIONS = [
  {
    code: 'excellent',
    label: 'Excellent',
    headline: 'Barely ridden',
    body: 'Minimal cosmetic wear and all components function like new. As close to new as a pre-owned bike gets.',
    dot: 'bg-emerald-500',
  },
  {
    code: 'very_good',
    label: 'Very Good',
    headline: 'Light cosmetic wear',
    body: 'Light wear from normal use, no significant scratches or paint damage. Mechanically dialed and ready to ride.',
    dot: 'bg-teal-500',
  },
  {
    code: 'good',
    label: 'Good',
    headline: 'Honest wear from real riding',
    body: 'Visible wear including light scratches or paint chips from normal use. Mechanically sound and fully service-ready.',
    dot: 'bg-amber-500',
  },
  {
    code: 'fair',
    label: 'Fair',
    headline: 'Significant cosmetic wear',
    body: 'Scratches, paint chips, or scuffs are documented in the photos. Mechanically functional and ride-ready — priced accordingly.',
    dot: 'bg-orange-500',
  },
]

export const CONDITION_BY_CODE = Object.fromEntries(CONDITIONS.map(c => [c.code, c]))

export function getCondition(code) {
  return CONDITION_BY_CODE[code] || null
}
