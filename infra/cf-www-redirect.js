function handler(event) {
    var request = event.request;
    var host = request.headers['host'].value;

    // 1. Canonical hostname: www.machxcycles.com -> machxcycles.com (301)
    if (host.startsWith('www.')) {
        var nonWww = host.slice(4);
        var uri = request.uri;
        var qs = '';
        var qsObj = request.querystring;
        if (qsObj) {
            var parts = [];
            var keys = Object.keys(qsObj);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var entry = qsObj[key];
                var vals = entry.multiValue ? entry.multiValue : [entry];
                for (var j = 0; j < vals.length; j++) {
                    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(vals[j].value));
                }
            }
            if (parts.length > 0) qs = '?' + parts.join('&');
        }
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: 'https://' + nonWww + uri + qs },
                'cache-control': { value: 'max-age=31536000' }
            }
        };
    }

    // 2. /images/* — strip the prefix so the request hits the S3 images
    // bucket origin at the right key. /images/bikes/1/x.webp → /bikes/1/x.webp.
    // The /images/* CloudFront behavior is wired to the images bucket origin;
    // this function just removes the URL-side prefix.
    if (request.uri.indexOf('/images/') === 0) {
        request.uri = request.uri.substring('/images'.length);
        return request;
    }

    // 3. Legacy /shop?category=N → 301 to /shop (clean URL).
    // We don't know the category-id → slug mapping at the edge, so we redirect
    // to the bare /shop and let the user re-pick. Better than serving 200 to
    // Googlebot at a URL we want to deprecate (no link-equity transfer).
    // Internal SPA navigation already uses /shop/{slug} directly.
    if (request.uri === '/shop' && request.querystring && request.querystring.category) {
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: 'https://machxcycles.com/shop' },
                'cache-control': { value: 'max-age=86400' }
            }
        };
    }

    // 4. Pretty-URL rewrite for prerendered routes.
    // Build outputs prerendered HTML at /shop/index.html, /bikes/foo/index.html, etc.
    // Crawlers and users request /shop or /bikes/foo (no trailing slash, no extension).
    // Rewrite those to the index.html so the prerendered HTML is served.
    //
    // Detection by an explicit asset-extension allowlist: anything else gets
    // rewritten. The previous "any extension" regex misclassified bike slugs
    // like /bikes/supersix-evo-2.0 (the .0 looked like a file extension)
    // and silently 404'd them.
    var u = request.uri;
    var assetExt = /\.(html?|js|mjs|css|json|png|jpe?g|svg|webp|avif|gif|ico|xml|txt|woff2?|map|pdf|mp4|webm)$/i;
    if (u !== '/' && !assetExt.test(u)) {
        if (u.charAt(u.length - 1) === '/') {
            request.uri = u + 'index.html';
        } else {
            request.uri = u + '/index.html';
        }
    }

    return request;
}
