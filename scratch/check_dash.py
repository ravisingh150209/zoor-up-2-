import requests

token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzg5MjhmNzVjOTgzZiIsInJvbGUiOiJCVVNJTkVTU19PV05FUiIsImJ1c2luZXNzX2lkIjoiYml6X2NjZThkM2MzYjMxNyIsImV4cCI6MTc5MTYxMDgxNH0.Y-TyYFAiMhUQshu-Z7IN7dppAbPM7YA20Rlq4UyVb1w'
headers = {
    'Origin': 'https://zoor-up-9b3a3.web.app',
    'Authorization': f'Bearer {token}',
    'Accept': 'application/json'
}

for i in range(5):
    try:
        r = requests.get('https://zoor-up-2.onrender.com/api/business/dashboard', headers=headers, timeout=15)
        print(f"Attempt {i}: {r.status_code}, CORS: {r.headers.get('access-control-allow-origin')}, Body: {r.text[:200]}")
    except Exception as e:
        print(f"Attempt {i} exception: {e}")
