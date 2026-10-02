/**
 * ZOOR UP Backend Subscription & UPI AutoPay Test Suite
 * Validates:
 * 1. Authoritative plans & pricing retrieval
 * 2. Default FREE plan state for businesses
 * 3. Subscription mandate creation (GROWTH plan)
 * 4. Mandate cryptographic verification & plan activation
 * 5. Tenant isolation (Business A vs Business B)
 * 6. Payment history logging
 * 7. Cancel Auto-renew at period end
 * 8. Webhook processing (subscription.charged renewal & idempotency)
 * 9. Invalid webhook signature rejection
 * 10. Platform admin inspection
 */
import assert from 'node:assert';

const BASE_URL = 'http://127.0.0.1:8000';

async function runSubscriptionTests() {
  console.log('==================================================');
  console.log('ZOOR UP REAL SUBSCRIPTION & AUTOPAY BACKEND TESTS');
  console.log('==================================================\n');

  const bizA = `biz_autopay_a_${Date.now()}`;
  const bizB = `biz_autopay_b_${Date.now()}`;

  // TEST 1: Retrieve Plans
  console.log('[TEST 1] Testing Authoritative Plans & Pricing...');
  const plansRes = await fetch(`${BASE_URL}/api/payments/razorpay/plans`);
  assert.strictEqual(plansRes.status, 200, 'Plans endpoint should return 200');
  const plansData = await plansRes.json();
  assert.strictEqual(plansData.success, true);
  assert.strictEqual(plansData.brand, 'ZOOR UP');
  assert.strictEqual(plansData.merchant_upi, '8521893325@ybl');
  const growthPlan = plansData.plans.find(p => p.id === 'GROWTH');
  assert.ok(growthPlan, 'Growth plan must exist');
  assert.strictEqual(growthPlan.monthly, 799, 'Growth plan price must be 799');
  console.log('✅ TEST 1 PASSED: Server-authoritative plans verified (Brand: ZOOR UP, UPI: 8521893325@ybl)\n');

  // TEST 2: Initial Subscription State (FREE by default)
  console.log('[TEST 2] Testing Business Initial Subscription (FREE)...');
  const subRes = await fetch(`${BASE_URL}/api/payments/razorpay/subscription?business_id=${bizA}`);
  assert.strictEqual(subRes.status, 200);
  const subData = await subRes.json();
  assert.strictEqual(subData.plan, 'FREE');
  assert.strictEqual(subData.amount, 0);
  assert.strictEqual(subData.is_free, true);
  console.log('✅ TEST 2 PASSED: New business defaults to FREE plan with ₹0 charge\n');

  // TEST 3: Create Recurring Subscription Mandate (GROWTH)
  console.log('[TEST 3] Testing Subscription Creation for GROWTH Plan...');
  const createRes = await fetch(`${BASE_URL}/api/payments/razorpay/subscription/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: bizA,
      plan_id: 'GROWTH',
      billing_interval: 'monthly',
      customer_upi: 'merchant_test@ybl'
    })
  });
  assert.strictEqual(createRes.status, 200);
  const createData = await createRes.json();
  assert.strictEqual(createData.success, true);
  assert.strictEqual(createData.autopay_enabled, true);
  assert.strictEqual(createData.amount, 799);
  assert.strictEqual(createData.brand, 'ZOOR UP');
  assert.strictEqual(createData.merchant_upi, '8521893325@ybl');
  const subscriptionId = createData.subscription_id;
  assert.ok(subscriptionId, 'Subscription ID must be returned');
  console.log(`✅ TEST 3 PASSED: Subscription mandate created (ID: ${subscriptionId}, Amount: ₹${createData.amount})\n`);

  // TEST 4: Verify Subscription Payment & Mandate Authorization
  console.log('[TEST 4] Testing Subscription Verification & Activation...');
  const paymentId = `pay_rzp_${Date.now()}`;
  const verifyRes = await fetch(`${BASE_URL}/api/payments/razorpay/subscription/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: bizA,
      plan_id: 'GROWTH',
      razorpay_subscription_id: subscriptionId,
      razorpay_payment_id: paymentId,
      razorpay_signature: 'test_mock_signature_valid'
    })
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.success, true);
  assert.strictEqual(verifyData.status, 'ACTIVE');
  assert.strictEqual(verifyData.plan, 'GROWTH');
  assert.strictEqual(verifyData.auto_renew, true);
  console.log('✅ TEST 4 PASSED: Subscription activated to GROWTH (auto_renew: true)\n');

  // Verify database state after activation
  const refreshedSub = await (await fetch(`${BASE_URL}/api/payments/razorpay/subscription?business_id=${bizA}`)).json();
  assert.strictEqual(refreshedSub.plan, 'GROWTH');
  assert.strictEqual(refreshedSub.status, 'ACTIVE');
  assert.strictEqual(refreshedSub.can_access_premium, true);
  assert.strictEqual(refreshedSub.auto_renew, true);

  // TEST 5: Tenant Isolation
  console.log('[TEST 5] Testing Tenant Isolation (Biz A vs Biz B)...');
  const bizBSub = await (await fetch(`${BASE_URL}/api/payments/razorpay/subscription?business_id=${bizB}`)).json();
  assert.strictEqual(bizBSub.plan, 'FREE', 'Biz B must not inherit Biz A subscription');
  assert.strictEqual(bizBSub.can_access_premium, false);

  const bizBHistory = await (await fetch(`${BASE_URL}/api/payments/razorpay/history?business_id=${bizB}`)).json();
  assert.strictEqual(bizBHistory.payments.length, 0, 'Biz B must see 0 payments');
  console.log('✅ TEST 5 PASSED: Tenant isolation confirmed between accounts\n');

  // TEST 6: Payment History
  console.log('[TEST 6] Testing Payment History for Biz A...');
  const historyRes = await fetch(`${BASE_URL}/api/payments/razorpay/history?business_id=${bizA}`);
  assert.strictEqual(historyRes.status, 200);
  const historyData = await historyRes.json();
  assert.ok(historyData.payments.length >= 1, 'Biz A must have recorded payments');
  const firstPayment = historyData.payments[0];
  assert.strictEqual(firstPayment.plan, 'GROWTH');
  assert.strictEqual(firstPayment.amount, 799);
  assert.strictEqual(firstPayment.status, 'PAID');
  assert.strictEqual(firstPayment.payment_method, 'upi_autopay');
  console.log(`✅ TEST 6 PASSED: Real payment record verified (ID: ${firstPayment.id}, Method: ${firstPayment.payment_method})\n`);

  // TEST 7: Cancel Auto-Renew
  console.log('[TEST 7] Testing Cancel Auto-Renew...');
  const cancelRes = await fetch(`${BASE_URL}/api/payments/razorpay/subscription/cancel-renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: bizA,
      subscription_id: subscriptionId
    })
  });
  assert.strictEqual(cancelRes.status, 200);
  const cancelData = await cancelRes.json();
  assert.strictEqual(cancelData.auto_renew, false);
  assert.strictEqual(cancelData.cancel_at_period_end, true);

  // Verify plan remains active until end of period
  const postCancelSub = await (await fetch(`${BASE_URL}/api/payments/razorpay/subscription?business_id=${bizA}`)).json();
  assert.strictEqual(postCancelSub.status, 'ACTIVE', 'Plan remains active until period ends');
  assert.strictEqual(postCancelSub.auto_renew, false);
  assert.strictEqual(postCancelSub.cancel_at_period_end, true);
  console.log('✅ TEST 7 PASSED: Auto-renew disabled; access preserved until current_period_end\n');

  // TEST 8: Webhook Processing & Idempotency
  console.log('[TEST 8] Testing Webhook Renewal (subscription.charged) & Idempotency...');
  const webhookEventId = `evt_test_${Date.now()}`;
  const renewalPayId = `pay_renewal_${Date.now()}`;
  const webhookPayload = {
    entity: 'event',
    account_id: 'acc_zoorup_test',
    event: 'subscription.charged',
    contains: ['subscription', 'payment'],
    payload: {
      subscription: {
        entity: {
          id: subscriptionId,
          plan_id: 'plan_growth_monthly',
          status: 'active',
          current_start: Math.floor(Date.now() / 1000),
          current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          notes: {
            business_id: bizA,
            plan: 'GROWTH'
          }
        }
      },
      payment: {
        entity: {
          id: renewalPayId,
          amount: 79900,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
          vpa: 'merchant_test@ybl'
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };

  const rawBody = JSON.stringify(webhookPayload);
  // Calculate valid signature using RAZORPAY_WEBHOOK_SECRET
  const crypto = await import('node:crypto');
  const validSig = crypto.createHmac('sha256', 'zoorup_webhook_secret_2026').update(rawBody).digest('hex');

  const whRes1 = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': validSig
    },
    body: rawBody
  });
  assert.strictEqual(whRes1.status, 200);
  const whData1 = await whRes1.json();
  assert.strictEqual(whData1.status, 'processed');

  // Test duplicate webhook idempotency
  const whRes2 = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': validSig
    },
    body: rawBody
  });
  assert.strictEqual(whRes2.status, 200);
  const whData2 = await whRes2.json();
  assert.strictEqual(whData2.status, 'duplicate_ignored', 'Duplicate webhook must be ignored');
  console.log('✅ TEST 8 PASSED: Webhook processed renewal payment & duplicate event ignored\n');

  // TEST 9: Invalid Webhook Signature Rejection
  console.log('[TEST 9] Testing Webhook Signature Tampering Rejection...');
  const tamperedSig = 'bad_forged_signature_12345';
  const badWhRes = await fetch(`${BASE_URL}/api/payments/razorpay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': tamperedSig
    },
    body: rawBody
  });
  assert.strictEqual(badWhRes.status, 400, 'Tampered webhook must be rejected with 400');
  console.log('✅ TEST 9 PASSED: Tampered/forged webhook rejected successfully\n');

  // TEST 10: Platform Admin Subscriptions Inspection
  console.log('[TEST 10] Testing Platform Admin Subscriptions Inspection...');
  const adminRes = await fetch(`${BASE_URL}/api/payments/razorpay/admin/subscriptions`);
  assert.strictEqual(adminRes.status, 200);
  const adminData = await adminRes.json();
  assert.strictEqual(adminData.success, true);
  assert.ok(adminData.subscriptions.length >= 1, 'Admin must see platform subscriptions');
  const foundBizA = adminData.subscriptions.find(s => s.business_id === bizA);
  assert.ok(foundBizA, 'Admin should find Biz A subscription');
  assert.strictEqual(foundBizA.plan, 'GROWTH');
  assert.strictEqual(foundBizA.status, 'ACTIVE');
  console.log(`✅ TEST 10 PASSED: Platform admin successfully retrieved ${adminData.count} subscriptions\n`);

  console.log('==================================================');
  console.log('ALL 10 SUBSCRIPTION & AUTOPAY BACKEND TESTS PASSED! ✅');
  console.log('==================================================');
}

runSubscriptionTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
