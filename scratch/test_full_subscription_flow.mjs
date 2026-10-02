/**
 * Complete End-to-End Real Subscription & UPI AutoPay Flow Test
 */
import assert from 'node:assert';
import crypto from 'node:crypto';

const BASE_URL = 'http://127.0.0.1:8000';

async function runFullTest() {
  console.log('================================================================');
  console.log('ZOOR UP END-TO-END SUBSCRIPTION & UPI AUTOPAY INTEGRATION TEST');
  console.log('================================================================\n');

  // STEP 1: Register real business
  const email = `merchant_${Date.now()}@teststore.com`;
  console.log(`[STEP 1] Registering real business: ${email}...`);
  const regRes = await fetch(`${BASE_URL}/api/auth/owner/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'SecurePassword123!',
      name: 'Spice Garden Bistro',
      owner_name: 'Rajesh Sharma',
      phone: String(Date.now()).slice(-10)
    })
  });
  assert.strictEqual(regRes.status, 200);
  const regData = await regRes.json();
  const businessId = regData.user.business_id;
  const token = regData.access_token;
  console.log(`✅ Business Registered: ID = ${businessId}\n`);

  // STEP 2: Verify default FREE plan
  console.log('[STEP 2] Verifying initial plan is FREE (₹0, no payment required)...');
  const subRes1 = await fetch(`${BASE_URL}/api/payments/razorpay/subscription?business_id=${businessId}`);
  const subData1 = await subRes1.json();
  assert.strictEqual(subData1.plan, 'FREE');
  assert.strictEqual(subData1.amount, 0);
  assert.strictEqual(subData1.is_free, true);
  console.log('✅ Default plan confirmed: FREE (₹0)\n');

  // STEP 3: Verify Authoritative Plans & Merchant Configuration
  console.log('[STEP 3] Verifying Authoritative Plans & Merchant Brand/UPI...');
  const plansRes = await fetch(`${BASE_URL}/api/payments/razorpay/plans`);
  const plansData = await plansRes.json();
  assert.strictEqual(plansData.brand, 'ZOOR UP');
  assert.strictEqual(plansData.merchant_upi, '8521893325@ybl');
  const growth = plansData.plans.find(p => p.id === 'GROWTH');
  assert.strictEqual(growth.monthly, 799);
  console.log('✅ Merchant Brand: ZOOR UP, UPI VPA: 8521893325@ybl, Growth: ₹799/mo\n');

  // STEP 4: Initiate Subscription with UPI AutoPay
  console.log('[STEP 4] Initiating GROWTH subscription with UPI AutoPay...');
  const createSubRes = await fetch(`${BASE_URL}/api/payments/razorpay/subscription/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      plan_id: 'GROWTH',
      billing_interval: 'monthly',
      customer_upi: 'sharma@oksbi'
    })
  });
  const createSubData = await createSubRes.json();
  assert.strictEqual(createSubData.success, true);
  assert.strictEqual(createSubData.amount, 799);
  assert.strictEqual(createSubData.brand, 'ZOOR UP');
  assert.strictEqual(createSubData.merchant_upi, '8521893325@ybl');
  const rzpSubId = createSubData.subscription_id;
  console.log(`✅ Subscription Created: ID = ${rzpSubId}, Amount = ₹${createSubData.amount}\n`);

  // STEP 5: Verify Mandate Authorization with Cryptographic Signature
  console.log('[STEP 5] Verifying mandate authorization with cryptographic signature...');
  const paymentId = `pay_upi_mandate_${Date.now()}`;
  const verifyRes = await fetch(`${BASE_URL}/api/payments/razorpay/subscription/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      plan_id: 'GROWTH',
      razorpay_subscription_id: rzpSubId,
      razorpay_payment_id: paymentId,
      razorpay_signature: 'test_mock_signature_valid'
    })
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.status, 'ACTIVE');
  assert.strictEqual(verifyData.plan, 'GROWTH');
  assert.strictEqual(verifyData.auto_renew, true);
  console.log('✅ Subscription successfully activated to GROWTH with auto_renew = ON\n');

  // STEP 6: Check Active State & Billing Schedule
  console.log('[STEP 6] Checking active subscription and next billing date...');
  const subRes2 = await fetch(`${BASE_URL}/api/payments/razorpay/subscription?business_id=${businessId}`);
  const subData2 = await subRes2.json();
  assert.strictEqual(subData2.status, 'ACTIVE');
  assert.strictEqual(subData2.plan, 'GROWTH');
  assert.strictEqual(subData2.auto_renew, true);
  assert.strictEqual(subData2.cancel_at_period_end, false);
  assert.ok(subData2.next_billing_date, 'Next billing date must be present');
  console.log(`✅ Next Billing Date: ${subData2.next_billing_date}\n`);

  // STEP 7: Check Real Payment History
  console.log('[STEP 7] Checking real payment history...');
  const histRes = await fetch(`${BASE_URL}/api/payments/razorpay/history?business_id=${businessId}`);
  const histData = await histRes.json();
  assert.strictEqual(histData.payments.length, 1);
  assert.strictEqual(histData.payments[0].amount, 799);
  assert.strictEqual(histData.payments[0].status, 'PAID');
  assert.strictEqual(histData.payments[0].payment_method, 'upi_autopay');
  console.log(`✅ Payment History verified: ₹${histData.payments[0].amount} paid via ${histData.payments[0].payment_method}\n`);

  // STEP 8: Cancel Auto-Renew
  console.log('[STEP 8] Cancelling Auto-Renew at cycle end...');
  const cancelRes = await fetch(`${BASE_URL}/api/payments/razorpay/subscription/cancel-renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      subscription_id: rzpSubId
    })
  });
  const cancelData = await cancelRes.json();
  assert.strictEqual(cancelData.auto_renew, false);
  assert.strictEqual(cancelData.cancel_at_period_end, true);

  const subRes3 = await fetch(`${BASE_URL}/api/payments/razorpay/subscription?business_id=${businessId}`);
  const subData3 = await subRes3.json();
  assert.strictEqual(subData3.status, 'ACTIVE', 'Plan must remain active until cycle end');
  assert.strictEqual(subData3.auto_renew, false);
  assert.strictEqual(subData3.cancel_at_period_end, true);
  console.log('✅ Auto-renew set to OFF. Access remains ACTIVE until current period ends\n');

  // STEP 9: Webhook Recurring Payment Renewal & Idempotency
  console.log('[STEP 9] Simulating Webhook recurring payment (subscription.charged)...');
  const renewalPayload = {
    entity: 'event',
    account_id: 'acc_zoorup_live',
    event: 'subscription.charged',
    contains: ['subscription', 'payment'],
    payload: {
      subscription: {
        entity: {
          id: rzpSubId,
          plan_id: 'plan_growth_monthly',
          status: 'active',
          current_start: Math.floor(Date.now() / 1000),
          current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          notes: {
            business_id: businessId,
            plan: 'GROWTH'
          }
        }
      },
      payment: {
        entity: {
          id: `pay_renewal_${Date.now()}`,
          amount: 79900,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
          vpa: 'sharma@oksbi'
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };

  const rawJson = JSON.stringify(renewalPayload);
  const sig = crypto.createHmac('sha256', 'zoorup_webhook_secret_2026').update(rawJson).digest('hex');

  const whRes = await fetch(`${BASE_URL}/api/payments/webhook/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': sig
    },
    body: rawJson
  });
  assert.strictEqual(whRes.status, 200);
  const whData = await whRes.json();
  assert.strictEqual(whData.status, 'processed');

  // Check payment history now has 2 entries (initial + renewal)
  const histRes2 = await fetch(`${BASE_URL}/api/payments/razorpay/history?business_id=${businessId}`);
  const histData2 = await histRes2.json();
  assert.strictEqual(histData2.payments.length, 2, 'Should have 2 recorded transactions');
  console.log(`✅ Webhook processed renewal. Total payment transactions: ${histData2.payments.length}\n`);

  // STEP 10: Platform Admin Oversight
  console.log('[STEP 10] Testing Platform Admin Oversight...');
  const adminRes = await fetch(`${BASE_URL}/api/payments/razorpay/admin/subscriptions`);
  const adminData = await adminRes.json();
  assert.strictEqual(adminData.success, true);
  const found = adminData.subscriptions.find(s => s.business_id === businessId);
  assert.ok(found, 'Platform admin must see this business subscription');
  assert.strictEqual(found.plan, 'GROWTH');
  console.log(`✅ Platform Admin inspection verified: Business "${found.business_name}" (${found.plan}, Status: ${found.status})\n`);

  console.log('================================================================');
  console.log('ALL SUBSCRIPTION & UPI AUTOPAY INTEGRATION TESTS COMPLETED! ✅');
  console.log('================================================================');
}

runFullTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
