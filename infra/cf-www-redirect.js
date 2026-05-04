function handler(event) {
    var request = event.request;
    var host = request.headers['host'].value;

    if (host.startsWith('www.')) {
        var nonWww = host.slice(4);
        var uri = request.uri;

        // Reconstruct querystring if present
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

    return request;
}
