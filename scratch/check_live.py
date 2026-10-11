import urllib.request
import re

html = urllib.request.urlopen('https://zoor-up-9b3a3.web.app').read().decode()
matches = re.findall(r'/assets/[a-zA-Z0-9_\-\.]+', html)
print('Assets referenced in live index.html:', matches)
for m in matches:
    if m.endswith('.js'):
        url = 'https://zoor-up-9b3a3.web.app' + m
        print('Checking JS asset:', url)
        js = urllib.request.urlopen(url).read().decode()
        print('  Length:', len(js))
        print('  Contains /api/business/dashboard?', '/api/business/dashboard' in js)
        print('  Contains zoor-up-2.onrender.com?', 'zoor-up-2.onrender.com' in js)
