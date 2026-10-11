import urllib.request, re

req = urllib.request.urlopen('https://zoor-up-9b3a3.web.app')
print('Firebase Status:', req.status)
content = req.read().decode('utf-8')
print('Root container present:', 'id="root"' in content)
scripts = re.findall(r'src="(/assets/[^"]+)"', content)
print('Script bundles found:', scripts)

if scripts:
    js_url = 'https://zoor-up-9b3a3.web.app' + scripts[0]
    js_req = urllib.request.urlopen(js_url)
    js_code = js_req.read().decode('utf-8')
    print('JS Bundle Size:', len(js_code), 'bytes')
    # Check if our fix is inside the production bundle:
    print('Has propSlug/params resolution:', 'propSlug' in js_code or 'businessId' in js_code)
    print('Has API_BASE_URL:', 'zoor-up-2.onrender.com' in js_code)
