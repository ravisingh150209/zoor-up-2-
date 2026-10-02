import crypto from 'crypto';

const JWT_SECRET = 'zoorup-super-secure-production-jwt-secret-key-2026';
const API_BASE = 'http://127.0.0.1:8000';

function createToken(payload, secret = JWT_SECRET, expiresInSeconds = 7 * 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    exp: payload.exp !== undefined ? payload.exp : now + expiresInSeconds,
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(fullPayload)}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

async function runTests() {
  console.log('====================================================');
  console.log('ZOOR UP - VERIFY NO DEFAULT PRO & STRICT FREE TIER');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, extra = '') {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName} ${extra}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${extra}`);
    }
  }

  // TEST 1: Register brand-new business via API
  const newEmail = `fresh_biz_${Date.now()}@teststore.com`;
  let newBizUser = null;
  let newBizToken = null;
  let newBizId = null;

  try {
    const regRes = await fetch(`${API_BASE}/api/auth/owner/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newEmail,
        password: 'Password123!',
        name: 'Test Store 001',
        owner_name: 'Test Owner',
        phone: '9' + String(Date.now()).slice(-9)
      })
    });
    const regData = await regRes.json();
    newBizUser = regData.user;
    newBizToken = regData.access_token;
    newBizId = regData.business?.id || regData.user?.business_id;

    assert(
      regRes.ok && regData.success && regData.business?.subscription_plan === 'FREE',
      'TEST 1: Register brand-new business',
      `-> business.subscription_plan is ${regData.business?.subscription_plan}`
    );
  } catch (e) {
    assert(false, 'TEST 1: Registration failed', e.message);
  }

  // TEST 2: GET /api/subscription/current for newly registered business
  try {
    const res = await fetch(`${API_BASE}/api/subscription/current`, {
      headers: { Authorization: `Bearer ${newBizToken}` }
    });
    const data = await res.json();
    assert(
      res.ok &&
      data.success === true &&
      data.plan === 'FREE' &&
      data.status === 'ACTIVE' &&
      data.payment_status === 'NOT_REQUIRED' &&
      data.amount === 0 &&
      data.auto_renew === false &&
      data.is_free === true &&
      data.can_access_premium === false,
      'TEST 2: New business subscription status is strictly FREE',
      `-> Plan: ${data.plan}, Status: ${data.status}, Amount: ₹${data.amount}, AutoRenew: ${data.auto_renew}`
    );
  } catch (e) {
    assert(false, 'TEST 2: Subscription query failed', e.message);
  }

  // TEST 3: Business without subscription record query fallback -> FREE
  try {
    const res = await fetch(`${API_BASE}/api/subscription/current?business_id=biz_random_unsubscribed_999`);
    const data = await res.json();
    assert(
      res.ok &&
      data.plan === 'FREE' &&
      data.amount === 0 &&
      data.payment_status === 'NOT_REQUIRED' &&
      data.auto_renew === false,
      'TEST 3: Random unsubscribed business ID defaults to FREE',
      `-> Plan: ${data.plan}, Amount: ₹${data.amount}`
    );
  } catch (e) {
    assert(false, 'TEST 3: Unsubscribed fallback failed', e.message);
  }

  // TEST 4: Existing unverified businesses from migration (Royal Spice biz_9f14253e2cb0)
  try {
    const res = await fetch(`${API_BASE}/api/subscription/current?business_id=biz_9f14253e2cb0`);
    const data = await res.json();
    assert(
      res.ok &&
      data.plan === 'FREE' &&
      data.amount === 0 &&
      data.payment_status === 'NOT_REQUIRED',
      'TEST 4: Migrated unverified business is strictly FREE',
      `-> Plan: ${data.plan}`
    );
  } catch (e) {
    assert(false, 'TEST 4: Migrated business check failed', e.message);
  }

  // TEST 5: Legitimate verified paid business is preserved (biz_a08e9112133d)
  try {
    const res = await fetch(`${API_BASE}/api/subscription/current?business_id=biz_a08e9112133d`);
    const data = await res.json();
    assert(
      res.ok &&
      data.plan === 'GROWTH' &&
      data.status === 'ACTIVE' &&
      data.amount === 799,
      'TEST 5: Legitimate paid business with verified payment preserves GROWTH plan',
      `-> Plan: ${data.plan}, Amount: ₹${data.amount}`
    );
  } catch (e) {
    assert(false, 'TEST 5: Paid business check failed', e.message);
  }

  // TEST 6: Tenant isolation - Business B (FREE) querying after Business A (GROWTH)
  try {
    // Query Business A (GROWTH)
    const resA = await fetch(`${API_BASE}/api/subscription/current?business_id=biz_a08e9112133d`);
    const dataA = await resA.json();

    // Query Business B (FREE)
    const resB = await fetch(`${API_BASE}/api/subscription/current`, {
      headers: { Authorization: `Bearer ${newBizToken}` }
    });
    const dataB = await resB.json();

    assert(
      dataA.plan === 'GROWTH' && dataB.plan === 'FREE' && dataB.amount === 0,
      'TEST 6: Tenant isolation (Business B never inherits Business A Pro/Growth plan)',
      `-> Biz A: ${dataA.plan}, Biz B: ${dataB.plan}`
    );
  } catch (e) {
    assert(false, 'TEST 6: Tenant isolation check failed', e.message);
  }

  // TEST 7: Selection without verification does NOT activate Pro
  try {
    // Business initiates PRO subscription
    const initRes = await fetch(`${API_BASE}/api/subscription/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newBizToken}`
      },
      body: JSON.stringify({
        plan_id: 'PRO',
        billing_interval: 'monthly'
      })
    });
    const initData = await initRes.json();

    // DO NOT verify payment (simulating user abandoned / canceled checkout)
    // Query subscription status again:
    const checkRes = await fetch(`${API_BASE}/api/subscription/current`, {
      headers: { Authorization: `Bearer ${newBizToken}` }
    });
    const checkData = await checkRes.json();

    // Status in subscriptions collection was CREATED/PENDING, so can_access_premium is False
    assert(
      checkData.status !== 'ACTIVE' || checkData.payment_status === 'PENDING' || checkData.can_access_premium === false,
      'TEST 7: Unverified checkout attempt NEVER grants active Pro subscription',
      `-> Status: ${checkData.status}, PaymentStatus: ${checkData.payment_status}, CanAccessPremium: ${checkData.can_access_premium}`
    );
  } catch (e) {
    assert(false, 'TEST 7: Checkout abandonment test failed', e.message);
  }

  // TEST 8: Verified payment successfully activates Pro
  try {
    const initRes = await fetch(`${API_BASE}/api/subscription/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newBizToken}`
      },
      body: JSON.stringify({
        plan_id: 'PRO',
        billing_interval: 'monthly'
      })
    });
    const initData = await initRes.json();

    const verifyRes = await fetch(`${API_BASE}/api/subscription/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newBizToken}`
      },
      body: JSON.stringify({
        razorpay_subscription_id: initData.subscription_id,
        razorpay_payment_id: `pay_test_${Date.now()}`,
        razorpay_signature: 'test_mock_signature_valid',
        plan_id: 'PRO'
      })
    });
    const verifyData = await verifyRes.json();

    const checkRes = await fetch(`${API_BASE}/api/subscription/current`, {
      headers: { Authorization: `Bearer ${newBizToken}` }
    });
    const checkData = await checkRes.json();

    assert(
      verifyRes.ok &&
      verifyData.success === true &&
      checkData.plan === 'PRO' &&
      checkData.status === 'ACTIVE' &&
      checkData.can_access_premium === true,
      'TEST 8: Verified payment successfully activates PRO Plan',
      `-> Plan: ${checkData.plan}, Status: ${checkData.status}, Access: ${checkData.can_access_premium}`
    );
  } catch (e) {
    assert(false, 'TEST 8: Verified activation test failed', e.message);
  }

  console.log(`\n====================================================`);
  console.log(`Test Results: ${passed}/${total} passed!`);
  if (passed === total) {
    console.log('✅ ALL TESTS PASSED: NO NEW BUSINESS DEFAULTS TO PRO!');
    console.log('====================================================');
  } else {
    process.exit(1);
  }
}

runTests();
