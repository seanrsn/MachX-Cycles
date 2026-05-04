// generate-sitemap.js — runs before vite build to create public/sitemap.xml
// Usage: node scripts/generate-sitemap.js

import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const API    = 'https://bs4rhhaumi.execute-api.us-east-1.amazonaws.com/prod'
const DOMAIN = 'https://machxcycles.com'

const STATIC = [
  { url: '/',        changefreq: 'weekly',  priority: '1.0' },
  { url: '/shop',    changefreq: 'daily',   priority: '0.9' },
  { url: '/about',   changefreq: 'monthly', priority: '0.5' },
  { url: '/contact', changefreq: 'monthly', priority: '0.5' },
]

async function generate() {
  console.log('🗺️  Generating sitemap.xml...')

  let bikePages = []
  try {
    const res  = await fetch(`${API}/bikes?limit=200`)
    const data = await res.json()
    bikePages  = (data.bikes || []).map(b => ({
      url:        `/bikes/${b.id}`,
      changefreq: 'weekly',
      priority:   '0.8',
    }))
    console.log(`   Found ${bikePages.length} bikes`)
  } catch (err) {
    console.warn('   ⚠️  Could not fetch bikes:', err.message, '— using static pages only')
  }

  const all = [...STATIC, ...bikePages]
  const now = new Date().toISOString().split('T')[0]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(p => `  <url>
    <loc>${DOMAIN}${p.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  const publicDir = resolve(__dirname, '../public')
  mkdirSync(publicDir, { recursive: true })
  writeFileSync(resolve(publicDir, 'sitemap.xml'), xml, 'utf8')
  console.log(`✅ sitemap.xml written (${all.length} URLs)`)
}

generate().catch(err => {
  console.error('❌ Sitemap generation failed:', err.message)
  // Don't fail the build — sitemap is not critical
  process.exit(0)
})
