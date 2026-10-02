// scratch/test_loyalty_system.mjs
// Automated verification for ZOOR UP 3D Dynamic Loyalty Card & 5-tier Level Up system

const BASE_URL = 'http://127.0.0.1:8000';

async function runTests() {
  console.log('🚀 Starting ZOOR UP 3D Dynamic Loyalty & Level Up System Automated Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Configurable Tiers API
    // -------------------------------------------------------------
    console.log('--- Test 1: Configurable Tiers API (/api/customer/loyalty/tiers) ---');
    const tiersRes = await fetch(`${BASE_URL}/api/customer/loyalty/tiers`);
    assert(tiersRes.ok, `HTTP ${tiersRes.status} from /api/customer/loyalty/tiers`);
    const tiersData = await tiersRes.json();
    assert(tiersData.success === true, 'Response success is true');
    assert(Array.isArray(tiersData.tiers) && tiersData.tiers.length === 5, `Returns 5 tiers (got ${tiersData.tiers?.length})`);

    const expectedTiers = ['BASIC', 'SILVER', 'GOLD', 'PLATINUM', 'ADVANCE'];
    const actualTierNames = tiersData.tiers.map(t => t.name);
    assert(
      JSON.stringify(actualTierNames) === JSON.stringify(expectedTiers),
      `Tier names match progression: ${actualTierNames.join(' → ')}`
    );

    // -------------------------------------------------------------
    // Test 2: Customer Authentication
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Customer Authentication & Token Generation ---');
    const testEmail = `loyalty_eval_${Date.now()}@zoorup.test`;
    const authRes = await fetch(`${BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        name: 'Ravi Test Customer',
        google_id: `goog_${Date.now()}`,
        role: 'CUSTOMER',
      }),
    });
    assert(authRes.ok, `Customer auth HTTP ${authRes.status}`);
    const authData = await authRes.json();
    assert(authData.success === true && authData.access_token, 'Received valid access_token');
    const token = authData.access_token;
    const customer = authData.customer;
    assert(customer && customer.customer_id, `Customer registered with ID: ${customer?.customer_id}`);

    // -------------------------------------------------------------
    // Test 3: Authoritative Loyalty Status API (Starting Level 1 BASIC)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Authoritative Loyalty Status (/api/customer/loyalty/status) ---');
    const statusRes = await fetch(`${BASE_URL}/api/customer/loyalty/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(statusRes.ok, `Loyalty status HTTP ${statusRes.status}`);
    const statusData = await statusRes.json();
    assert(statusData.success === true, 'Loyalty status success is true');
    assert(statusData.level === 1, `Initial level is 1 (got ${statusData.level})`);
    assert(statusData.level_name === 'BASIC', `Initial tier is BASIC (got ${statusData.level_name})`);
    assert(statusData.points === 0, `Initial points is 0 (got ${statusData.points})`);
    assert(statusData.stamps === 0, `Initial stamps is 0 (got ${statusData.stamps})`);
    assert(statusData.next_tier?.name === 'SILVER', `Next tier is SILVER (got ${statusData.next_tier?.name})`);
    assert(statusData.points_needed === 500, `Points needed for SILVER is 500 (got ${statusData.points_needed})`);

    // -------------------------------------------------------------
    // Test 4: Business Setup for Scan Check-in
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Setup Business for Real Check-in ---');
    const bizRes = await fetch(`${BASE_URL}/api/businesses/public`);
    let bizId = null;
    if (bizRes.ok) {
      const bizList = await bizRes.json();
      if (Array.isArray(bizList) && bizList.length > 0) {
        bizId = bizList[0].id;
      }
    }
    if (!bizId) {
      // Create a test business
      const ownerRes = await fetch(`${BASE_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `biz_owner_${Date.now()}@zoorup.test`,
          name: 'Loyalty Cafe Owner',
          google_id: `goog_owner_${Date.now()}`,
          role: 'BUSINESS',
        }),
      });
      const ownerData = await ownerRes.json();
      bizId = ownerData.business?.id;
    }
    assert(bizId, `Target business ID for check-in: ${bizId}`);

    // -------------------------------------------------------------
    // Test 5: Check-in Visit Flow (Automatic Stamp & Points Awarding)
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Check-in Visit Flow (/api/customer/visits/checkin) ---');
    const checkinRes = await fetch(`${BASE_URL}/api/customer/visits/checkin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        business_id: bizId,
        counter_code: 'MAIN-DESK-01',
      }),
    });
    assert(checkinRes.ok, `Checkin HTTP ${checkinRes.status}`);
    const checkinData = await checkinRes.json();
    assert(checkinData.success === true, 'Checkin recorded successfully');
    assert(checkinData.stamps_awarded >= 1, `Awarded stamps: ${checkinData.stamps_awarded}`);
    assert(checkinData.points_awarded > 0, `Awarded points: ${checkinData.points_awarded}`);

    // Verify updated loyalty status reflects the visit
    const statusAfterCheckinRes = await fetch(`${BASE_URL}/api/customer/loyalty/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusAfterCheckin = await statusAfterCheckinRes.json();
    assert(statusAfterCheckin.stamps >= 1, `Total stamps updated to: ${statusAfterCheckin.stamps}`);
    assert(statusAfterCheckin.points >= 50, `Total points updated to: ${statusAfterCheckin.points}`);

    // -------------------------------------------------------------
    // Test 6: Verify 5-Tier Progression Thresholds
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Verify 5-Tier Calculation Logic on Backend ---');
    // Verify each tier threshold directly from backend tier rules:
    // Level 1: 0 - 499 (BASIC)
    // Level 2: 500 - 1499 (SILVER)
    // Level 3: 1500 - 2999 (GOLD)
    // Level 4: 3000 - 4999 (PLATINUM)
    // Level 5: 5000+ (ADVANCE)
    const tierChecks = [
      { pts: 0, expectedLvl: 1, expectedName: 'BASIC' },
      { pts: 499, expectedLvl: 1, expectedName: 'BASIC' },
      { pts: 500, expectedLvl: 2, expectedName: 'SILVER' },
      { pts: 1499, expectedLvl: 2, expectedName: 'SILVER' },
      { pts: 1500, expectedLvl: 3, expectedName: 'GOLD' },
      { pts: 2999, expectedLvl: 3, expectedName: 'GOLD' },
      { pts: 3000, expectedLvl: 4, expectedName: 'PLATINUM' },
      { pts: 4999, expectedLvl: 4, expectedName: 'PLATINUM' },
      { pts: 5000, expectedLvl: 5, expectedName: 'ADVANCE' },
      { pts: 12500, expectedLvl: 5, expectedName: 'ADVANCE' },
    ];

    for (const tc of tierChecks) {
      // Find tier in backend tiers list
      const matched = tiersData.tiers.find(
        t => tc.pts >= t.min_points && (t.max_points === null || tc.pts <= t.max_points)
      );
      assert(
        matched && matched.level === tc.expectedLvl && matched.name === tc.expectedName,
        `${tc.pts} pts maps to Level ${tc.expectedLvl} (${tc.expectedName})`
      );
    }

    // -------------------------------------------------------------
    // Test 7: Multi-business separation
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Multi-Business Separation Check ---');
    assert(checkinData.visit && checkinData.visit.business_id === bizId, 'Check-in visit is strictly scoped to the scanned business');

    console.log(`\n========================================`);
    console.log(`Total tests passed: ${passed}`);
    console.log(`Total tests failed: ${failed}`);
    console.log(`========================================\n`);

    if (failed === 0) {
      console.log('🎉 ALL AUTOMATED LOYALTY & LEVEL UP TESTS PASSED PERFECTLY!');
      process.exit(0);
    } else {
      console.error('⚠️ Some tests failed.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test run:', err);
    process.exit(1);
  }
}

runTests();
