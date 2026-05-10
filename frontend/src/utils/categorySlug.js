// categorySlug.js — single source of truth for category slug derivation.
// Used by:
//   - Shop.jsx (URL ↔ category lookup, link generation)
//   - Footer.jsx, Home.jsx (link generation)
//   - scripts/prerender.js + scripts/generate-sitemap.js (per-category routes)
//
// "Road" → "road"
// "Mountain" → "mountain"
// "E-Bikes" → "e-bikes"

export function categorySlug(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function findCategoryBySlug(categories, slug) {
  if (!slug) return null
  const target = String(slug).toLowerCase()
  return (categories || []).find(c => categorySlug(c.name) === target) || null
}

export function categoryPath(category) {
  return category ? `/shop/${categorySlug(category.name)}` : '/shop'
}
