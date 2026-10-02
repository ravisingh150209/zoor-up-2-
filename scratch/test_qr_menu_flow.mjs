const BACKEND_URL = 'http://127.0.0.1:8000';

async function runTests() {
  console.log('==================================================');
  console.log('ZOOR UP QR & DIGITAL MENU COMPREHENSIVE E2E VERIFICATION');
  console.log('==================================================');

  // Test 1: Register Business A
  console.log('\n[TEST 1] Registering Business A ("Green Leaf Grocery")...');
  const bizAEmail = `greenleaf_${Date.now()}@example.com`;
  const regAResp = await fetch(`${BACKEND_URL}/api/auth/owner/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Green Leaf Grocery',
      email: bizAEmail,
      password: 'Password123!',
      phone: '9876543210'
    })
  });
  const bizAData = await regAResp.json();
  console.log('Register Business A Status:', regAResp.status);
  console.log('Business A ID:', bizAData.business?.id);
  console.log('Business A Slug:', bizAData.business?.slug);
  if (!bizAData.business?.slug || bizAData.business.slug !== 'green-leaf-grocery') {
    throw new Error(`Expected slug 'green-leaf-grocery', got: ${bizAData.business?.slug}`);
  }

  const tokenA = bizAData.access_token;
  const bizAId = bizAData.business.id;
  const bizASlug = bizAData.business.slug;

  // Add Product to Business A
  console.log('\n[TEST 2] Adding products to Business A...');
  const prodAResp = await fetch(`${BACKEND_URL}/api/business/${bizAId}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      name: 'Organic Apples',
      description: 'Crisp fresh red apples',
      price: 120,
      discount_price: 100,
      category: 'Fruits',
      stock: 50,
      active: true
    })
  });
  console.log('Add Product A Status:', prodAResp.status);

  // Test 3: Register Business B
  console.log('\n[TEST 3] Registering Business B ("Royal Spice Restaurant")...');
  const bizBEmail = `royalspice_${Date.now()}@example.com`;
  const regBResp = await fetch(`${BACKEND_URL}/api/auth/owner/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Royal Spice Restaurant',
      email: bizBEmail,
      password: 'Password123!',
      phone: '9876543211'
    })
  });
  const bizBData = await regBResp.json();
  console.log('Register Business B Status:', regBResp.status);
  console.log('Business B ID:', bizBData.business?.id);
  console.log('Business B Slug:', bizBData.business?.slug);

  const tokenB = bizBData.access_token;
  const bizBId = bizBData.business.id;
  const bizBSlug = bizBData.business.slug;

  // Add Product to Business B
  console.log('\n[TEST 4] Adding products to Business B...');
  const prodBResp = await fetch(`${BACKEND_URL}/api/business/${bizBId}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`
    },
    body: JSON.stringify({
      name: 'Butter Chicken Curry',
      description: 'Creamy authentic butter chicken',
      price: 350,
      discount_price: 320,
      category: 'Main Course',
      stock: 30,
      active: true
    })
  });
  console.log('Add Product B Status:', prodBResp.status);

  // Test 5: Verify QR Resolution Endpoint
  console.log('\n[TEST 5] Testing QR Resolution with Canonical & Legacy Formats...');
  
  // 5a. Canonical URL: https://app.zoorup.com/menu/green-leaf-grocery
  const qr1 = await (await fetch(`${BACKEND_URL}/api/qr/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_data: `https://app.zoorup.com/menu/${bizASlug}` })
  })).json();
  console.log('Canonical URL QR resolution:', qr1.destination, 'Match:', qr1.business_slug === bizASlug);

  // 5b. Legacy store- prefix: https://app.zoorup.com/menu/store-biz_xxxx
  const qr2 = await (await fetch(`${BACKEND_URL}/api/qr/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_data: `https://app.zoorup.com/menu/store-${bizAId}` })
  })).json();
  console.log('Legacy store- prefix QR resolution:', qr2.destination, 'Match:', qr2.business_slug === bizASlug);

  // 5c. Query param: https://app.zoorup.com/menu?business_id=biz_xxxx
  const qr3 = await (await fetch(`${BACKEND_URL}/api/qr/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_data: `https://app.zoorup.com/menu?business_id=${bizAId}` })
  })).json();
  console.log('Query param QR resolution:', qr3.destination, 'Match:', qr3.business_slug === bizASlug);

  // Test 6: Verify Public Menu API & Strict Business Isolation
  console.log('\n[TEST 6] Testing Public Menu API & Isolation...');

  // 6a. Direct slug access
  const menuAResp = await fetch(`${BACKEND_URL}/api/public/menu/${bizASlug}`);
  const menuA = await menuAResp.json();
  console.log('Menu A Status:', menuAResp.status);
  console.log('Menu A Business Name:', menuA.business?.name);
  console.log('Menu A Items Count:', menuA.products?.length);
  console.log('Menu A First Item:', menuA.products?.[0]?.name);

  if (menuA.business?.name !== 'Green Leaf Grocery') throw new Error('Menu A business mismatch');
  if (menuA.products?.[0]?.name !== 'Organic Apples') throw new Error('Menu A product mismatch');

  // 6b. Business B Menu
  const menuBResp = await fetch(`${BACKEND_URL}/api/public/menu/${bizBSlug}`);
  const menuB = await menuBResp.json();
  console.log('Menu B Status:', menuBResp.status);
  console.log('Menu B Business Name:', menuB.business?.name);
  console.log('Menu B Items Count:', menuB.products?.length);
  console.log('Menu B First Item:', menuB.products?.[0]?.name);

  if (menuB.business?.name !== 'Royal Spice Restaurant') throw new Error('Menu B business mismatch');
  if (menuB.products?.[0]?.name !== 'Butter Chicken Curry') throw new Error('Menu B product mismatch');

  // Verify Strict Isolation: Neither store has the other store's products
  const aHasB = (menuA.products || []).some(p => p.name.includes('Butter Chicken'));
  const bHasA = (menuB.products || []).some(p => p.name.includes('Organic Apples'));
  console.log('Strict Isolation Verified: Business A has Butter Chicken?', aHasB, 'Business B has Apples?', bHasA);
  if (aHasB || bHasA) throw new Error('Cross-business menu leak detected!');

  // 6c. Legacy store- prefix in menu endpoint
  const legacyResp = await fetch(`${BACKEND_URL}/api/public/menu/store-${bizAId}`);
  console.log('Legacy store- prefix endpoint status:', legacyResp.status);
  const legacyData = await legacyResp.json();
  console.log('Legacy endpoint business name:', legacyData.business?.name);
  if (legacyResp.status !== 200) throw new Error('Legacy store- prefix endpoint failed');

  // 6d. Direct ID in menu endpoint
  const idResp = await fetch(`${BACKEND_URL}/api/public/menu/${bizAId}`);
  console.log('Direct ID endpoint status:', idResp.status);
  if (idResp.status !== 200) throw new Error('Direct ID endpoint failed');

  // 6e. Non-existent slug returns 404
  const notFoundResp = await fetch(`${BACKEND_URL}/api/public/menu/non-existent-store-xyz-123`);
  console.log('Non-existent slug status:', notFoundResp.status);
  if (notFoundResp.status !== 404) throw new Error('Expected 404 for non-existent store');

  console.log('\n==================================================');
  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! ✅');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
