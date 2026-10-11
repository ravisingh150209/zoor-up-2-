
async function test() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzZlNjAyMTIzNjRlMSIsInJvbGUiOiJDVVNUT01FUiIsImN1c3RvbWVyX2lkIjoiY3VzX2M4N2YzOTc1MWFkMiIsImV4cCI6MTc5MTYxOTcxN30.hEEyu3BqtJZeKWKD5MIgqtdQ-KY2ZGqGk5nYvgU5qlA';

  // Now test sequential requests
  console.log('\nTesting sequential requests...');
  const resLoyalty = await fetch('https://zoor-up-2.onrender.com/api/loyalty/biz_8b17f1d06981', {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  console.log('Loyalty Status:', resLoyalty.status, await resLoyalty.text());

  const resRewards = await fetch('https://zoor-up-2.onrender.com/api/customer/rewards?business_id=biz_8b17f1d06981', {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  console.log('Rewards Status:', resRewards.status, await resRewards.text());

  const resClaimed = await fetch('https://zoor-up-2.onrender.com/api/customer/rewards/claimed', {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  console.log('Claimed Status:', resClaimed.status, await resClaimed.text());
}

test().catch(console.error);
