// generate-sitemap.js — runs before vite build to create public/sitemap.xml
// Usage: node scripts/generate-sitemap.js

import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const API    = 'https://bs4rhhaumi.execute-api.us-east-1.amazonaws.com/prod'
const DOMAIN = 'https://machxcycles.com'

const STATIC = [
  { url: '/',            changefreq: 'daily',   priority: '1.0' },
  { url: '/shop',        changefreq: 'daily',   priority: '0.9' },
  { url: '/about',       changefreq: 'monthly', priority: '0.6' },
  { url: '/contact',     changefreq: 'monthly', priority: '0.6' },
  { url: '/support',     changefreq: 'monthly', priority: '0.5' },
  { url: '/track-order', changefreq: 'monthly', priority: '0.3' },
]

// Mirrors src/utils/categorySlug.js — keep in sync.
function categorySlug(name) {
  return String(name || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function generate() {
  console.log('Generating sitemap.xml...')

  let bikePages = []
  let categoryPages = []
  const todayIso = new Date().toISOString().split('T')[0]
  try {
    const res  = await fetch(`${API}/bikes?limit=500`)
    const data = await res.json()
    bikePages = (data.bikes || [])
      // Skip sold bikes (no longer purchasable; some are 410 / OutOfStock).
      // Skip bikes without a slug — slug-only routing means /bikes/{id} 404s
      // and the prerender already filters them too. Mirroring the prerender
      // filter keeps sitemap honest.
      .filter(b => !b.sold && b.slug)
      .map(b => {
        // Per-bike <lastmod> from the bike's own updated_at if present, else today.
        // Crawlers use this to skip unchanged URLs — saves crawl budget.
        let lastmod = todayIso
        if (b.updated_at) {
          try { lastmod = new Date(b.updated_at).toISOString().split('T')[0] } catch { /* fall back */ }
        }
        return {
          url:        `/bikes/${b.slug}`,
          lastmod,
          changefreq: 'weekly',
          priority:   '0.8',
        }
      })
    console.log(`   Found ${bikePages.length} live, slugged bikes (sold/no-slug filtered)`)
  } catch (err) {
    console.warn('   Could not fetch bikes:', err.message, '- using static pages only')
  }

  // Per-category landing pages — /shop/road, /shop/mountain, /shop/e-bikes, etc.
  // Each is prerendered to its own folder by scripts/prerender.js with proper
  // canonical + meta tags. Listing them lets Google rank "used road bikes
  // Brooklyn"-style queries against the dedicated pages.
  try {
    const res  = await fetch(`${API}/categories`)
    const data = await res.json()
    categoryPages = (data.categories || [])
      .map(c => ({ slug: categorySlug(c.name), name: c.name }))
      .filter(c => c.slug)
      .map(c => ({
        url:        `/shop/${c.slug}`,
        lastmod:    todayIso,
        changefreq: 'daily',
        priority:   '0.85',
      }))
    console.log(`   Found ${categoryPages.length} categories`)
  } catch (err) {
    console.warn('   Could not fetch categories:', err.message)
  }

  const all = [
    ...STATIC.map(s => ({ ...s, lastmod: todayIso })),
    ...categoryPages,
    ...bikePages,
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(p => `  <url>
    <loc>${DOMAIN}${p.url}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  const publicDir = resolve(__dirname, '../public')
  mkdirSync(publicDir, { recursive: true })
  writeFileSync(resolve(publicDir, 'sitemap.xml'), xml, 'utf8')
  console.log(`Wrote sitemap.xml (${all.length} URLs)`)
}

generate().catch(err => {
  console.error('❌ Sitemap generation failed:', err.message)
  // Don't fail the build — sitemap is not critical
  process.exit(0)
})
