const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzZlNjAyMTIzNjRlMSIsInJvbGUiOiJDVVNUT01FUiIsImN1c3RvbWVyX2lkIjoiY3VzX2M4N2YzOTc1MWFkMiIsImV4cCI6MTc5MTYxOTcxN30.hEEyu3BqtJZeKWKD5MIgqtdQ-KY2ZGqGk5nYvgU5qlA';

async function testProfile() {
  console.log('Testing GET /api/customer/profile with customer token...');
  const resp = await fetch('https://zoor-up-2.onrender.com/api/customer/profile', {
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Accept': 'application/json'
    }
  });

  console.log('Status:', resp.status);
  const body = await resp.text();
  console.log('Body:', body);

  console.log('\nTesting PUT /api/customer/profile...');
  const putResp = await fetch('https://zoor-up-2.onrender.com/api/customer/profile', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      name: 'VIP Loyalty Customer',
      address: '123 Test Street'
    })
  });

  console.log('PUT Status:', putResp.status);
  const putBody = await putResp.text();
  console.log('PUT Body:', putBody);
}

testProfile().catch(console.error);
