import urllib.request
import json
import time

RENDER_URL = "https://zoor-up-2.onrender.com"

def check_health():
    url = f"{RENDER_URL}/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ZoorUpVerifier/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print("Render Health Response:", data)
            return True
    except Exception as e:
        print(f"Waiting for Render... ({e})")
        return False

print("Pinging Render...")
for i in range(12):
    if check_health():
        break
    time.sleep(10)
