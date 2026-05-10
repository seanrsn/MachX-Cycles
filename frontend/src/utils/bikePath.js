// Build a SEO-friendly URL for a bike. Pure slug, no internal ID exposed:
//   /bikes/cannondale-supersix
//
// Slug-only routing: /bikes/{numericId} now 404s (no fallback). If a bike is
// missing a slug (legacy seed data, schema is supposed to enforce non-null),
// fall back to /shop so internal links don't dead-end at a 404. Backend
// admin should backfill slugs via the admin form for any bike that hits this.
export function bikePath(bike) {
  if (bike?.slug) return `/bikes/${bike.slug}`
  return '/shop'
}
