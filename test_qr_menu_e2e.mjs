const BACKEND_URL = 'http://127.0.0.1:8000';
const FRONTEND_URL = 'http://localhost:5173';

async function runTests() {
  console.log('====================================================');
  console.log('ZOOR UP: End-to-End Real Business QR Menu & Table Verification');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  const testTimestamp = Date.now();
  let tokenA = '';
  let bizA = null;
  let tokenB = '';
  let bizB = null;

  // STEP 1: Register Real Business A
  console.log('--- STEP 1: Register Business A (Green Leaf Grocery) ---');
  try {
    const regResA = await fetch(`${BACKEND_URL}/api/auth/owner/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Green Leaf Grocery',
        owner_name: 'Rahul Sharma',
        email: `greenleaf_${testTimestamp}@test.com`,
        phone: `98${String(testTimestamp).slice(-8)}`,
        password: 'Password@123',
      }),
    });
    const regDataA = await regResA.json();
    assert(regResA.ok && regDataA.access_token, 'Registered Business A Owner & Created Permanent Business Record');
    tokenA = regDataA.access_token;
    bizA = regDataA.business;
    console.log(`   Business A ID: ${bizA.id} | Slug: ${bizA.slug}`);
  } catch (e) {
    assert(false, 'Register Business A', e.message);
  }

  // STEP 2: Register Real Business B
  console.log('\n--- STEP 2: Register Business B (Mountain Brew Cafe) ---');
  try {
    const regResB = await fetch(`${BACKEND_URL}/api/auth/owner/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mountain Brew Cafe',
        owner_name: 'Aarav Mehta',
        email: `mountain_${testTimestamp}@test.com`,
        phone: `97${String(testTimestamp).slice(-8)}`,
        password: 'Password@123',
      }),
    });
    const regDataB = await regResB.json();
    assert(regResB.ok && regDataB.access_token, 'Registered Business B Owner & Created Permanent Business Record');
    tokenB = regDataB.access_token;
    bizB = regDataB.business;
    console.log(`   Business B ID: ${bizB.id} | Slug: ${bizB.slug}`);
  } catch (e) {
    assert(false, 'Register Business B', e.message);
  }

  // STEP 3: Add Real Products for Business A (Pizza ₹250, Burger ₹150)
  console.log('\n--- STEP 3: Add Real Menu Items for Business A ---');
  try {
    const p1Res = await fetch(`${BACKEND_URL}/api/business/${bizA.id}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        name: 'Pizza Margherita',
        category: 'Food',
        price: 250,
        description: 'Fresh mozzarella, basil and marinara on sourdough crust',
        available: true,
      }),
    });
    const p1 = await p1Res.json();

    const p2Res = await fetch(`${BACKEND_URL}/api/business/${bizA.id}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        name: 'Veggie Burger',
        category: 'Food',
        price: 150,
        description: 'Crisp vegetable patty with herb sauce',
        available: true,
      }),
    });
    const p2 = await p2Res.json();

    assert(p1.id && p2.id, `Created Pizza (₹250) and Burger (₹150) for Business A`);
  } catch (e) {
    assert(false, 'Add Products Business A', e.message);
  }

  // STEP 4: Add Real Products for Business B (Cappuccino Cold Brew ₹120)
  console.log('\n--- STEP 4: Add Real Menu Items for Business B ---');
  try {
    const pBRes = await fetch(`${BACKEND_URL}/api/business/${bizB.id}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        name: 'Cappuccino Cold Brew',
        category: 'Beverages',
        price: 120,
        description: '18-hour steeped cold brew with velvety milk foam',
        available: true,
      }),
    });
    const pB = await pBRes.json();
    assert(pB.id, `Created Cappuccino Cold Brew (₹120) for Business B`);
  } catch (e) {
    assert(false, 'Add Products Business B', e.message);
  }

  // STEP 5: Authoritative QR Resolution Test
  console.log('\n--- STEP 5: Authoritative QR Resolver Tests ---');
  const qrCases = [
    { qr: `https://app.zoorup.com/menu/${bizA.slug}`, expectedDest: `/menu/${bizA.slug}`, type: 'MENU' },
    { qr: `https://app.zoorup.com/m/${bizA.slug}`, expectedDest: `/menu/${bizA.slug}`, type: 'MENU' },
    { qr: `/menu/${bizA.slug}`, expectedDest: `/menu/${bizA.slug}`, type: 'MENU' },
    { qr: bizA.slug, expectedDest: `/menu/${bizA.slug}`, type: 'MENU' },
  ];

  for (const c of qrCases) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/qr/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_data: c.qr }),
      });
      const data = await res.json();
      assert(
        res.ok && data.destination === c.expectedDest && data.type === c.type,
        `QR Resolve: "${c.qr}" → destination "${data.destination}"`,
        JSON.stringify(data)
      );
    } catch (e) {
      assert(false, `QR Resolve: "${c.qr}"`, e.message);
    }
  }

  // Invalid QR test
  try {
    const res = await fetch(`${BACKEND_URL}/api/qr/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_data: 'https://unrelated-external-site.com/foo' }),
    });
    const data = await res.json();
    assert(!data.success, 'Invalid QR code gracefully rejected with error message');
  } catch (e) {
    assert(false, 'Invalid QR check', e.message);
  }

  // STEP 6: Public Menu API & Strict Business Isolation Test
  console.log('\n--- STEP 6: Public Menu API & Business Isolation ---');
  try {
    const resA = await fetch(`${BACKEND_URL}/api/public/menu/${bizA.slug}`);
    const dataA = await resA.json();

    assert(resA.ok, `GET /api/public/menu/${bizA.slug} returns 200 OK without requiring login`);
    assert(dataA.business && dataA.business.slug === bizA.slug, 'Business branding and slug match Business A');
    assert(dataA.business.upi_id !== undefined, 'Business UPI ID present for dynamic payments');

    const hasPizzaA = dataA.items.some(i => i.name === 'Pizza Margherita');
    const hasBurgerA = dataA.items.some(i => i.name === 'Veggie Burger');
    const hasCoffeeA = dataA.items.some(i => i.name === 'Cappuccino Cold Brew');

    assert(hasPizzaA && hasBurgerA, 'Business A menu contains Pizza Margherita and Veggie Burger');
    assert(!hasCoffeeA, 'Business A menu DOES NOT contain Business B products (Cappuccino Cold Brew)');

    // Query Business B
    const resB = await fetch(`${BACKEND_URL}/api/public/menu/${bizB.slug}`);
    const dataB = await resB.json();
    const hasCoffeeB = dataB.items.some(i => i.name === 'Cappuccino Cold Brew');
    const hasPizzaB = dataB.items.some(i => i.name === 'Pizza Margherita');

    assert(hasCoffeeB, 'Business B menu contains Cappuccino Cold Brew');
    assert(!hasPizzaB, 'Business B menu DOES NOT contain Business A products (Pizza Margherita)');
  } catch (e) {
    assert(false, 'Public Menu & Business Isolation', e.message);
  }

  // STEP 7: Table Management & Seating Availability
  console.log('\n--- STEP 7: Table Management, Capacity & Overlap Protection ---');
  try {
    // Add Table 1 (capacity 2) and Table 2 (capacity 4) for Business A
    const t1Res = await fetch(`${BACKEND_URL}/api/tables/${bizA.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ table_number: 'Table 1', capacity: 2, location: 'Window' }),
    });
    const t1 = await t1Res.json();

    const t2Res = await fetch(`${BACKEND_URL}/api/tables/${bizA.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ table_number: 'Table 2', capacity: 4, location: 'Main Dining' }),
    });
    const t2 = await t2Res.json();

    assert(t1.id && t2.id, `Created Table 1 (capacity 2) and Table 2 (capacity 4) for Business A`);

    // Capacity test: Customer requests 4 guests -> only Table 2 should appear
    const capRes = await fetch(
      `${BACKEND_URL}/api/tables/${bizA.id}/available?date=2026-09-26&time=19:00&party_size=4`
    );
    const capTables = await capRes.json();
    const t1InCap = capTables.some(t => t.table_number === 'Table 1');
    const t2InCap = capTables.some(t => t.table_number === 'Table 2');
    assert(!t1InCap && t2InCap, 'Capacity test: Table 2 (cap 4) is returned for 4 guests; Table 1 (cap 2) is filtered out');

    // Book Table 2 for 19:00 -> 20:30
    const bookRes = await fetch(`${BACKEND_URL}/api/tables/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: bizA.id,
        customer_name: 'Pooja Verma',
        customer_phone: '9876543210',
        booking_date: '2026-09-26',
        booking_time: '19:00',
        party_size: 4,
        table_id: t2.id,
      }),
    });
    const booking = await bookRes.json();
    assert(bookRes.ok && booking.id, `Booked Table 2 for 19:00 (Booking ID: ${booking.id})`);

    // Check availability at 19:30 (during active reservation slot) -> Table 2 must NOT be available
    const overlapRes = await fetch(
      `${BACKEND_URL}/api/tables/${bizA.id}/available?date=2026-09-26&time=19:30&party_size=4`
    );
    const overlapTables = await overlapRes.json();
    const t2InOverlap = overlapTables.some(t => t.id === t2.id);
    assert(!t2InOverlap, 'Overlap test: Table 2 is NOT available at 19:30 during active 19:00 reservation');

    // Attempt double booking at same 19:30 slot -> must reject with 409 Conflict
    const doubleBookRes = await fetch(`${BACKEND_URL}/api/tables/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: bizA.id,
        customer_name: 'Overlapping Customer',
        customer_phone: '9876543211',
        booking_date: '2026-09-26',
        booking_time: '19:30',
        party_size: 4,
        table_id: t2.id,
      }),
    });
    assert(doubleBookRes.status === 409, 'Server-side double booking rejection returns 409 Conflict');

    // Check non-conflicting time: 21:00 -> Table 2 becomes available again
    const laterRes = await fetch(
      `${BACKEND_URL}/api/tables/${bizA.id}/available?date=2026-09-26&time=21:00&party_size=4`
    );
    const laterTables = await laterRes.json();
    const t2Later = laterTables.some(t => t.id === t2.id);
    assert(t2Later, 'Table 2 is available at 21:00 after previous reservation slot finishes');

    // Cancel reservation -> Table 2 should become available again for 19:00 slot
    const cancelRes = await fetch(`${BACKEND_URL}/api/tables/bookings/${booking.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Plans changed' }),
    });
    assert(cancelRes.ok, 'Reservation cancelled successfully');

    const freedRes = await fetch(
      `${BACKEND_URL}/api/tables/${bizA.id}/available?date=2026-09-26&time=19:00&party_size=4`
    );
    const freedTables = await freedRes.json();
    const t2Freed = freedTables.some(t => t.id === t2.id);
    assert(t2Freed, 'Cancelled booking frees Table 2 for 19:00 slot again');
  } catch (e) {
    assert(false, 'Table Management & Booking logic', e.message);
  }

  // STEP 8: Direct Frontend Route Verification
  console.log('\n--- STEP 8: Frontend Direct URL Verification ---');
  try {
    const res = await fetch(`${FRONTEND_URL}/menu/${bizA.slug}`);
    const html = await res.text();
    assert(res.ok && html.includes('<div id="root">'), `Frontend serves /menu/${bizA.slug} directly without redirecting to dashboard`);
  } catch (e) {
    assert(false, 'Direct Menu Frontend URL', e.message);
  }

  console.log('\n====================================================');
  console.log(`FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
