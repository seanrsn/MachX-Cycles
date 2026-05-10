// Post-build prerender. Crawls every public route in a headless browser,
// captures the fully-rendered HTML, and writes it back to dist/. Crawlers
// (Bing, social previews, AI search engines) see real content instead of
// the empty `<div id="root">` SPA shell.
//
// Routes prerendered:
//   - All static storefront routes (/, /shop, /shop?category=N, /about, etc.)
//   - Every active bike's detail page (fetched from /bikes API)
//
// Routes intentionally skipped (interactive / auth-protected):
//   - /admin/*
//   - /login
//   - /checkout
//   - /order-confirmation
//
// Output structure:
//   dist/index.html               (already exists from vite, gets overwritten)
//   dist/shop/index.html
//   dist/about/index.html
//   dist/bikes/123-cannondale-supersix/index.html
//   ...
// CloudFront viewer-request function rewrites /shop -> /shop/index.html so
// these are served on the original URLs.

import { createServer } from 'http'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs'
import { resolve, dirname, join, extname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '..', 'dist')
const API  = process.env.VITE_API_BASE_URL || 'https://bs4rhhaumi.execute-api.us-east-1.amazonaws.com/prod'

const STATIC_ROUTES = ['/', '/shop', '/about', '/contact', '/support', '/track-order', '/404']

const SKIP_PATTERNS = [
  /^\/admin/,
  /^\/login(\/|$)/,
  /^\/checkout(\/|$)/,
  /^\/order-confirmation/,
]
const shouldSkip = route => SKIP_PATTERNS.some(p => p.test(route))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.xml':  'application/xml',
  '.txt':  'text/plain',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

// Tiny SPA-aware static file server. Serves files from dist/, falls back to
// dist/index.html for any URL without a matching file (so client-side routes
// load the SPA shell that the headless browser then renders).
function startServer() {
  return new Promise((resolveFn) => {
    const server = createServer((req, res) => {
      let path
      try {
        path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      } catch {
        path = req.url
      }
      if (path === '/') path = '/index.html'

      let file = join(DIST, path)
      let isFallback = false
      try {
        if (!existsSync(file) || statSync(file).isDirectory()) {
          file = join(DIST, 'index.html')
          isFallback = true
        }
      } catch {
        file = join(DIST, 'index.html')
        isFallback = true
      }

      const ext = isFallback ? '.html' : extname(file).toLowerCase()
      try {
        const body = readFileSync(file)
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        res.end(body)
      } catch (e) {
        res.writeHead(500)
        res.end('Internal error: ' + e.message)
      }
    })
    server.listen(0, () => resolveFn(server))
  })
}

async function fetchBikes() {
  try {
    const res  = await fetch(`${API}/bikes?limit=500`)
    const data = await res.json()
    return data.bikes || []
  } catch (e) {
    console.warn('  Could not fetch bikes:', e.message, '— prerendering static routes only')
    return []
  }
}

async function fetchCategories() {
  try {
    const res  = await fetch(`${API}/categories`)
    const data = await res.json()
    return data.categories || []
  } catch (e) {
    console.warn('  Could not fetch categories:', e.message, '— skipping per-category prerender')
    return []
  }
}

// Mirrors src/utils/categorySlug.js — keep in sync.
function categorySlug(name) {
  return String(name || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function saveHtml(route, html) {
  const target = route === '/'
    ? join(DIST, 'index.html')
    : join(DIST, route.replace(/\/$/, ''), 'index.html')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, html, 'utf8')
}

async function main() {
  const t0 = Date.now()
  console.log('Prerendering...')

  // Lazy-import puppeteer so the script's mere presence doesn't break builds
  // where puppeteer isn't installed (e.g. CI without Chrome). If unavailable,
  // skip prerendering and exit 0 — the unrendered SPA still works.
  let puppeteer
  try {
    puppeteer = (await import('puppeteer')).default
  } catch {
    console.warn('  puppeteer not installed — skipping prerender (SPA shell will be served)')
    return
  }

  const [bikes, cats] = await Promise.all([fetchBikes(), fetchCategories()])

  // Slug-only URLs. /bikes/{id} and /bikes/{id}-{slug} are no longer supported;
  // they 404 like any other unknown URL.
  const bikeRoutes = []
  for (const b of bikes) {
    if (b.sold || !b.slug) continue
    bikeRoutes.push(`/bikes/${b.slug}`)
  }

  // Per-category landing pages — /shop/road, /shop/mountain, /shop/e-bikes, etc.
  // Each gets its own prerendered HTML with proper canonical and meta tags
  // (Shop.jsx reads :categorySlug from useParams). Captures high-intent
  // commercial keywords ("used road bikes Brooklyn") that the bare /shop
  // page doesn't rank for.
  const categoryRoutes = []
  for (const c of cats) {
    const slug = categorySlug(c.name)
    if (!slug) continue
    categoryRoutes.push(`/shop/${slug}`)
  }

  const allRoutes = [...STATIC_ROUTES, ...categoryRoutes, ...bikeRoutes].filter(r => !shouldSkip(r))
  console.log(`  Routes to prerender: ${allRoutes.length} (${STATIC_ROUTES.length} static + ${categoryRoutes.length} categories + ${bikeRoutes.length} bike URLs)`)

  const server = await startServer()
  const port   = server.address().port
  const baseUrl = `http://localhost:${port}`

  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  } catch (e) {
    console.error('  Failed to launch puppeteer:', e.message)
    server.close()
    return
  }

  let ok = 0, failed = 0
  for (const route of allRoutes) {
    const start = Date.now()
    let page
    try {
      page = await browser.newPage()
      // Block third-party requests we don't care about (analytics etc.) so
      // networkidle settles faster.
      await page.setRequestInterception(true)
      page.on('request', req => {
        const url = req.url()
        if (url.startsWith(baseUrl) || url.startsWith(API) || url.startsWith('https://machxcycles.com')) {
          req.continue()
        } else {
          req.abort()
        }
      })
      await page.goto(baseUrl + route, { waitUntil: 'networkidle0', timeout: 30000 })
      // Small extra settle for react-helmet + final paint
      await new Promise(r => setTimeout(r, 300))
      const html = await page.content()
      saveHtml(route, html)
      const ms = Date.now() - start
      console.log(`  ${route}  ${ms}ms`)
      ok++
    } catch (e) {
      console.warn(`  ${route}  FAILED: ${e.message}`)
      failed++
    } finally {
      if (page) await page.close().catch(() => {})
    }
  }

  await browser.close()
  server.close()

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`Done. ${ok} ok, ${failed} failed in ${elapsed}s`)
  if (failed > 0 && ok === 0) process.exit(1)
}

main().catch(e => {
  console.error('Prerender crashed:', e)
  process.exit(1)
})
