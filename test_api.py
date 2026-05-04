import urllib.request, json

BASE = "https://bs4rhhaumi.execute-api.us-east-1.amazonaws.com/prod"

def search(q):
    url = f"{BASE}/bikes?search={urllib.parse.quote(q)}&limit=5"
    with urllib.request.urlopen(url) as r:
        data = json.load(r)
    bikes = data.get('bikes', [])
    total = data.get('total', 0)
    print(f"\n  search={q!r}  =>  total={total}, results={[b['name'] for b in bikes]}")

import urllib.parse

queries = ['kanondale', 'canondale', 'cannondale', 'cannondalee', 'trek domein', 'supersix']
for q in queries:
    try:
        search(q)
    except Exception as e:
        print(f"\n  search={q!r}  =>  ERROR: {e}")
