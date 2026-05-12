import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { Bike, ArrowRight } from 'lucide-react'
import Navbar from '../../components/store/Navbar'

// Rendered for any unknown route. Prerender saves a copy at /404/index.html
// which CloudFront serves as the body of HTTP 404 responses (configured via
// CustomErrorResponses on the distribution). The Helmet noindex tells Google
// to drop this URL from the index — important so junk URLs don't accumulate
// as "duplicates of /".

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>Page not found | MachX Cycles</title>
        <meta name="description" content="The page you were looking for doesn't exist or may have been moved." />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <Navbar />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <Bike size={56} className="mx-auto text-gray-300 mb-5" />
          <p className="text-pink-600 text-[11px] font-bold uppercase tracking-[0.22em] mb-2">404</p>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3 tracking-tight">
            Page not found
          </h1>
          <p className="text-gray-500 mb-6">
            The page you were looking for doesn't exist or may have been moved.
            If you got here from a link, the bike may have already sold.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/shop"
              className="inline-flex items-center justify-center gap-2 mx-gradient-btn text-white px-6 py-3 rounded-xl font-semibold transition-colors"
            >
              Browse bikes <ArrowRight size={18} />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:border-pink-500 hover:text-pink-600 px-6 py-3 rounded-xl font-semibold transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
