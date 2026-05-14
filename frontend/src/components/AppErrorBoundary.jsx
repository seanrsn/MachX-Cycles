import { Component } from 'react'

/**
 * Catches errors that bubble out of any descendant component, with special
 * handling for the "stale chunk" failure mode you hit after a deploy:
 *
 *   - Browser had old index.html cached pointing at /assets/Shop-OLDHASH.js
 *   - We deploy new bundle → those files no longer exist on S3 → 404
 *   - lazy(() => import('./pages/store/Shop')) rejects with one of:
 *       "Failed to fetch dynamically imported module"
 *       "Loading chunk N failed"
 *       "Importing a module script failed"
 *   - Suspense doesn't catch import errors, so without this boundary the
 *     tree unmounts and the user sees the bare body background ("black screen")
 *
 * For that specific class of error we auto-reload once. The reload pulls a
 * fresh index.html (which references the new chunk hashes), and the user
 * lands back on the same URL with the new bundle in ~1 round trip.
 *
 * For any other error we show a friendly fallback with a manual reload.
 */

const CHUNK_ERROR_PATTERNS = [
  /Loading chunk [\d\w]+ failed/i,
  /Loading CSS chunk [\d\w]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
]

const RELOAD_KEY = 'mx-chunk-reload-attempted'

function isChunkError(err) {
  const msg = err?.message || ''
  return CHUNK_ERROR_PATTERNS.some(re => re.test(msg))
}

export default class AppErrorBoundary extends Component {
  state = { error: null, reloading: false }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface to the console so you can still see it in DevTools / Sentry.
    console.error('[AppErrorBoundary]', error, info)

    if (isChunkError(error)) {
      // Guard against infinite reload loops. If we've already tried once
      // this session, don't loop — show the fallback and let the user click.
      const already = sessionStorage.getItem(RELOAD_KEY) === '1'
      if (!already) {
        sessionStorage.setItem(RELOAD_KEY, '1')
        this.setState({ reloading: true })
        // Defer slightly so React commits the "reloading" UI before the reload.
        setTimeout(() => window.location.reload(), 50)
      }
    }
  }

  reset = () => {
    sessionStorage.removeItem(RELOAD_KEY)
    window.location.reload()
  }

  render() {
    const { error, reloading } = this.state

    if (!error) return this.props.children

    if (reloading) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-6">The page hit an unexpected error. Refreshing usually fixes it.</p>
          <button
            onClick={this.reset}
            className="mx-gradient-btn text-white px-6 py-3 rounded-xl font-semibold"
          >
            Refresh page
          </button>
        </div>
      </div>
    )
  }
}
