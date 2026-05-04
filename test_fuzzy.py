from difflib import SequenceMatcher

tests = [
    ('kanondale',   'cannondale'),
    ('canondale',   'cannondale'),
    ('cannondalee', 'cannondale'),
    ('trek',        'trek'),
    ('domein',      'domain'),
    ('kanondale',   'supersix'),
]
for a, b in tests:
    r = SequenceMatcher(None, a, b).ratio()
    status = 'MATCH' if r >= 0.75 else 'MISS'
    print(f'{a:<20} vs {b:<15} = {r:.3f}  [{status}]')
