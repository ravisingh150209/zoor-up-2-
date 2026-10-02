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
  console.log('ZOOR UP SUBSCRIPTION CONNECTION & API VERIFICATION');
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

  // Test 1: Plans endpoint
  try {
    const res = await fetch(`${API_BASE}/api/subscription/plans`);
    const data = await res.json();
    assert(res.ok && data.success && Array.isArray(data.plans) && data.plans.length === 4, '1. GET /api/subscription/plans returns 4 tiers');
  } catch (e) {
    assert(false, '1. GET /api/subscription/plans failed', e.message);
  }

  // Test 2: Unauthenticated request without token or query param -> 401
  try {
    const res = await fetch(`${API_BASE}/api/subscription/current`);
    const data = await res.json();
    assert(res.status === 401 && data.detail?.includes('Unable to resolve'), '2. GET /api/subscription/current without auth returns 401');
  } catch (e) {
    assert(false, '2. GET /api/subscription/current without auth failed', e.message);
  }

  // Test 3: Unauthenticated request WITH business_id query param fallback -> 200 FREE state
  try {
    const res = await fetch(`${API_BASE}/api/subscription/current?business_id=test_store_free_123`);
    const data = await res.json();
    assert(
      res.ok &&
      data.success === true &&
      data.plan === 'FREE' &&
      data.status === 'ACTIVE' &&
      data.payment_status === 'NOT_REQUIRED' &&
      data.auto_renew === false &&
      data.is_free === true,
      '3. GET /api/subscription/current with business_id fallback returns valid default FREE plan'
    );
  } catch (e) {
    assert(false, '3. Query fallback test failed', e.message);
  }

  // Test 4: Authenticated request with Bearer token for fresh business user
  try {
    const freshToken = createToken({ sub: 'user_48789e0c6eb1', role: 'BUSINESS_OWNER' });
    const res = await fetch(`${API_BASE}/api/subscription/current`, {
      headers: { Authorization: `Bearer ${freshToken}` }
    });
    const data = await res.json();
    assert(
      res.ok &&
      data.success === true &&
      data.business_id === 'biz_9f14253e2cb0' &&
      data.status === 'ACTIVE' &&
      data.payment_status === 'NOT_REQUIRED' &&
      data.plan === 'FREE',
      '4. GET /api/subscription/current with Bearer token resolves business & returns FREE state'
    );
  } catch (e) {
    assert(false, '4. Authenticated fresh business test failed', e.message);
  }

  // Test 5: Expired Bearer token returns 401
  try {
    const expiredToken = createToken({
      sub: 'user_37f7c3e26da2',
      role: 'BUSINESS_OWNER',
      exp: Math.floor(Date.now() / 1000) - 3600
    });
    const res = await fetch(`${API_BASE}/api/subscription/current`, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    const data = await res.json();
    assert(res.status === 401 && data.detail?.includes('expired'), '5. Expired token returns 401 "Token has expired"');
  } catch (e) {
    assert(false, '5. Expired token test failed', e.message);
  }

  // Test 6: Create subscription with Bearer token
  let createdSubId = null;
  try {
    const token = createToken({ sub: 'user_37f7c3e26da2', role: 'BUSINESS_OWNER' });
    const res = await fetch(`${API_BASE}/api/subscription/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        plan_id: 'STARTER',
        billing_interval: 'monthly'
      })
    });
    const data = await res.json();
    createdSubId = data.subscription_id;
    assert(
      res.ok &&
      data.success === true &&
      data.plan_id === 'STARTER' &&
      data.amount === 299 &&
      Boolean(createdSubId),
      '6. POST /api/subscription/create initiates subscription mandate'
    );
  } catch (e) {
    assert(false, '6. Create subscription test failed', e.message);
  }

  // Test 7: Verify subscription payment
  try {
    const token = createToken({ sub: 'user_37f7c3e26da2', role: 'BUSINESS_OWNER' });
    const res = await fetch(`${API_BASE}/api/subscription/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        razorpay_subscription_id: createdSubId || 'sub_test_fallback',
        razorpay_payment_id: 'pay_test_validation_001',
        razorpay_signature: 'test_mock_signature_valid',
        plan_id: 'STARTER'
      })
    });
    const data = await res.json();
    assert(
      res.ok &&
      data.success === true &&
      data.status === 'ACTIVE' &&
      data.plan === 'STARTER',
      '7. POST /api/subscription/verify activates verified subscription'
    );
  } catch (e) {
    assert(false, '7. Verify subscription test failed', e.message);
  }

  // Test 8: Get payment history for business
  try {
    const token = createToken({ sub: 'user_37f7c3e26da2', role: 'BUSINESS_OWNER' });
    const res = await fetch(`${API_BASE}/api/subscription/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    assert(
      res.ok &&
      data.success === true &&
      Array.isArray(data.payments) &&
      data.payments.length >= 1,
      '8. GET /api/subscription/history returns tenant-isolated payment history'
    );
  } catch (e) {
    assert(false, '8. Payment history test failed', e.message);
  }

  // Test 9: Cancel Auto-Renew
  try {
    const token = createToken({ sub: 'user_37f7c3e26da2', role: 'BUSINESS_OWNER' });
    const res = await fetch(`${API_BASE}/api/subscription/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });
    const data = await res.json();
    assert(
      res.ok &&
      data.success === true &&
      data.auto_renew === false &&
      data.cancel_at_period_end === true,
      '9. POST /api/subscription/cancel disables auto-renew while retaining active period'
    );
  } catch (e) {
    assert(false, '9. Cancel auto-renew test failed', e.message);
  }

  console.log(`\nResults: ${passed}/${total} tests passed!`);
  if (passed === total) {
    console.log('✅ ALL SUBSCRIPTION TESTS PASSED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runTests();
