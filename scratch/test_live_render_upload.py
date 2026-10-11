import urllib.request
import json
import uuid

def main():
    print("Testing Live Render Backend Upload...")
    login_req = urllib.request.Request(
        'https://zoor-up-2.onrender.com/api/auth/login',
        data=json.dumps({'email': 'biz_offers_69700@zoorup.com', 'password': 'Password123!'}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(login_req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        token = data.get('access_token') or data.get('token')

    boundary = '----WebKitFormBoundary' + uuid.uuid4().hex
    png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82'

    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="live_test.png"\r\nContent-Type: image/png\r\n\r\n'.encode('utf-8'),
        png_data,
        f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="entity_type"\r\n\r\nbusiness_logo\r\n'.encode('utf-8'),
        f'--{boundary}\r\nContent-Disposition: form-data; name="business_id"\r\n\r\nbiz_8b17f1d06981\r\n'.encode('utf-8'),
        f'--{boundary}--\r\n'.encode('utf-8')
    ]
    body = b"".join(parts)

    upload_req = urllib.request.Request(
        'https://zoor-up-2.onrender.com/api/uploads/image',
        data=body,
        headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'Authorization': f'Bearer {token}'
        }
    )
    try:
        with urllib.request.urlopen(upload_req) as resp:
            res = json.loads(resp.read().decode('utf-8'))
            print('UPLOAD STATUS:', resp.status)
            print('UPLOAD RESPONSE:', res)
            if 'supabase.co' in res.get('url', ''):
                print('RENDER HAS DEPLOYED SUPABASE STORAGE BACKEND!')
            else:
                print('RENDER STILL RUNNING OLD BUILD:', res.get('url'))
    except urllib.error.HTTPError as e:
        print('HTTP ERROR:', e.code, e.read().decode('utf-8', errors='ignore'))

if __name__ == '__main__':
    main()
