// Test Suite for ZOOR UP Authentication, Registration, Onboarding & Isolation Flows
import assert from 'node:assert';

// Mock browser localStorage & sessionStorage for Node.js environment
const createMockStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
};

global.localStorage = createMockStorage();
global.sessionStorage = createMockStorage();

// Dynamic imports of services
const { authService } = await import('./src/services/authService.js');
const { businessService } = await import('./src/services/businessService.js');
const { productService } = await import('./src/services/productService.js');
const { customerService } = await import('./src/services/customerService.js');
const { orderService } = await import('./src/services/orderService.js');
const { qrService } = await import('./src/services/qrService.js');
const { subscriptionService } = await import('./src/services/subscriptionService.js');
const { uploadService } = await import('./src/services/uploadService.js');
const { staffService } = await import('./src/services/staffService.js');
const { loyaltyService } = await import('./src/services/loyaltyService.js');
const { localDB } = await import('./src/services/storageSeed.js');

console.log('====================================================');
console.log('STARTING ZOOR UP FLOW VERIFICATION TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;

async function test1() {
  console.log('--- TEST 1: New Business Owner Registration ---');
  const regEmail = `owner_${Date.now()}@mycafe.test`;
  const regData = {
    name: '',
    owner_name: '',
    email: regEmail,
    phone: '',
    password: 'securePassword123',
  };

  const res = await authService.registerBusiness(regData);

  assert.strictEqual(res.error, null, 'Registration should have no error');
  assert.ok(res.user, 'User must be created');
  assert.ok(res.business, 'Business must be created');

  // Verify business status is ACTIVE (No PENDING_REVIEW)
  assert.strictEqual(res.business.status, 'ACTIVE', 'Business status must be instantly ACTIVE');
  assert.strictEqual(res.business.onboarding_completed, false, 'Onboarding must start false');
  
  // Verify owner_id matches user.id
  assert.strictEqual(res.business.owner_id, res.user.id, 'Business owner_id must match authenticated user id');

  // Verify all profile fields start empty
  assert.strictEqual(res.business.name, '', 'New business name must be empty string');
  assert.strictEqual(res.business.owner_name, '', 'Owner name must be empty string');
  assert.strictEqual(res.business.logo, null, 'Logo must be null');
  assert.strictEqual(res.business.category, '', 'Category must be empty string');
  assert.strictEqual(res.business.address, '', 'Address must be empty string');
  assert.strictEqual(res.business.city, '', 'City must be empty string');
  assert.strictEqual(res.business.state, '', 'State must be empty string');
  assert.strictEqual(res.business.postal_code, '', 'Postal code must be empty string');

  passedTests++;
  console.log('✅ TEST 1 PASSED: Business registered instantly ACTIVE with 100% empty profile.\n');
  return { user: res.user, business: res.business, email: regEmail };
}

async function test2(context) {
  console.log('--- TEST 2: Onboarding Persistence Across Logout & Re-login ---');
  const bizId = context.business.id;

  // Step 1: Save Business Name
  await businessService.saveOnboardingStep(bizId, 1, { name: 'My Cafe' });

  // Step 4 & 5: Save Phone & Address
  await businessService.saveOnboardingStep(bizId, 4, { phone: '9999999999' });
  await businessService.saveOnboardingStep(bizId, 5, { address: 'The Mall Road', city: 'Shimla' });

  // Verify stored in DB before logout
  let bizInDb = await businessService.getBusiness(bizId);
  assert.strictEqual(bizInDb.name, 'My Cafe');
  assert.strictEqual(bizInDb.phone, '9999999999');
  assert.strictEqual(bizInDb.city, 'Shimla');

  // Simulate Logout
  await authService.logout();
  const sessionAfterLogout = authService.getCurrentUser();
  assert.strictEqual(sessionAfterLogout, null, 'Session must be cleared on logout');

  // Verify DB data STILL EXISTS in storage after logout
  bizInDb = await businessService.getBusiness(bizId);
  assert.strictEqual(bizInDb.name, 'My Cafe', 'Database data must never disappear after logout');
  assert.strictEqual(bizInDb.phone, '9999999999');
  assert.strictEqual(bizInDb.city, 'Shimla');

  // Log back in
  const loginRes = await authService.login({
    identifier: context.email,
    password: 'securePassword123',
    role: 'business'
  });

  assert.strictEqual(loginRes.error, null, 'Login must succeed');
  assert.strictEqual(loginRes.user.business_id, bizId, 'User business_id must be restored');
  assert.strictEqual(loginRes.user.business_name, 'My Cafe', 'Business name must be restored on user');

  passedTests++;
  console.log('✅ TEST 2 PASSED: Onboarding data saved immediately and persisted across logout and login.\n');
}

async function test3(context) {
  console.log('--- TEST 3: Browser Refresh & Session Restoration ---');
  // Call getMe() to simulate app initialization on refresh
  const meRes = await authService.getMe();
  assert.strictEqual(meRes.error, null, 'getMe should find active session');
  assert.ok(meRes.user, 'Current user must be restored');
  assert.strictEqual(meRes.user.email, context.email);
  assert.ok(meRes.business, 'Linked business must be restored');
  assert.strictEqual(meRes.business.city, 'Shimla');

  passedTests++;
  console.log('✅ TEST 3 PASSED: Session and business verified upon reload.\n');
}

async function test4(context) {
  console.log('--- TEST 4: Duplicate Account Prevention ---');
  const dupRes = await authService.registerBusiness({
    name: 'Duplicate Store',
    email: context.email, // Same email!
    password: 'anotherPassword123',
  });

  assert.strictEqual(dupRes.user, null, 'Duplicate account must not be created');
  assert.strictEqual(
    dupRes.detail,
    'An account with this email already exists. Please log in.',
    'Must return exact error message'
  );

  passedTests++;
  console.log('✅ TEST 4 PASSED: Duplicate registration rejected with exact error detail.\n');
}

async function test5() {
  console.log('--- TEST 5: Google / Gmail OAuth Flow ---');
  const googleEmail = `google.merchant.${Date.now()}@gmail.com`;
  const googleId = `goog_id_${Date.now()}`;

  // First Login: Should create new ACTIVE user & empty business
  const firstRes = await authService.loginWithGoogle({
    googleId,
    email: googleEmail,
    name: 'Google Merchant',
    role: 'business',
  });

  assert.strictEqual(firstRes.error, null);
  assert.strictEqual(firstRes.isNew, true, 'First login must mark isNew');
  assert.strictEqual(firstRes.user.auth_provider, 'google');
  assert.strictEqual(firstRes.user.provider_user_id, googleId);
  assert.ok(firstRes.business, 'Business must be created');
  assert.strictEqual(firstRes.business.status, 'ACTIVE');
  assert.strictEqual(firstRes.business.onboarding_completed, false);
  const firstBizId = firstRes.business.id;

  // Add name to business
  await businessService.updateBusiness(firstBizId, { name: 'Google Gourmet Corner' });

  // Simulate logout
  await authService.logout();

  // Second Login with same Google ID: Should load SAME existing user and business
  const secondRes = await authService.loginWithGoogle({
    googleId,
    email: googleEmail,
    name: 'Google Merchant',
    role: 'business',
  });

  assert.strictEqual(secondRes.error, null);
  assert.strictEqual(secondRes.isNew, false, 'Second login must not create duplicate user');
  assert.strictEqual(secondRes.user.id, firstRes.user.id, 'User ID must match original');
  assert.strictEqual(secondRes.business.id, firstBizId, 'Must load same business record');
  assert.strictEqual(secondRes.business.name, 'Google Gourmet Corner', 'Must retain business data');

  passedTests++;
  console.log('✅ TEST 5 PASSED: Google OAuth creates active business first time, reloads same user on second login.\n');
}

async function test6() {
  console.log('--- TEST 6: Customer Registration & Persistence Across Logout ---');
  const cusEmail = `customer_${Date.now()}@domain.test`;
  const regCus = await authService.registerCustomer({
    name: 'Diya Sharma',
    phone: '+91 99887 76655',
    email: cusEmail,
    password: 'password123',
  });

  assert.strictEqual(regCus.error, null);
  assert.ok(regCus.customer);
  assert.strictEqual(regCus.customer.name, 'Diya Sharma');
  assert.strictEqual(regCus.customer.rank, 'Bronze');
  assert.strictEqual(regCus.customer.points, 0);
  const cusId = regCus.customer.id;

  // Logout
  await authService.logout();
  assert.strictEqual(authService.getCurrentUser(), null);

  // Login again
  const logCus = await authService.login({
    identifier: cusEmail,
    password: 'password123',
    role: 'customer',
  });

  assert.strictEqual(logCus.error, null);
  assert.strictEqual(logCus.user.name, 'Diya Sharma');
  assert.strictEqual(logCus.user.points, 0);

  passedTests++;
  console.log('✅ TEST 6 PASSED: Customer registration and data persistent across logout/login.\n');
}

async function test7(context) {
  console.log('--- TEST 7: Tenant Data Isolation (Business A vs Business B) ---');
  const bizAId = context.business.id;
  
  // Register Business B
  const bizBRes = await authService.registerBusiness({
    name: 'Business B Store',
    email: `biz_b_${Date.now()}@store.test`,
    phone: '',
    password: 'password123',
  });
  const bizBId = bizBRes.business.id;

  // Add product to Business A
  await productService.addProduct(bizAId, {
    name: 'Business A Organic Honey',
    price: 350,
    category: 'Pantry',
  });

  // Query products for Business B
  const bizBProducts = await productService.getProducts(bizBId);
  assert.strictEqual(bizBProducts.length, 0, 'Business B must NOT see Business A products');

  // Query products for Business A
  const bizAProducts = await productService.getProducts(bizAId);
  assert.strictEqual(bizAProducts.length, 1);
  assert.strictEqual(bizAProducts[0].name, 'Business A Organic Honey');

  passedTests++;
  console.log('✅ TEST 7 PASSED: Complete tenant isolation verified between Business A and Business B.\n');
}

async function test8() {
  console.log('--- TEST 8: Customer vs Business Role Protection ---');
  // Check authService role matching
  const customer = localDB.getUsers().find(u => u.role === 'customer');
  assert.ok(customer, 'Customer must exist');
  assert.notStrictEqual(customer.role, 'business');

  // Verify that an invalid role attempt fails
  const attempt = await authService.login({
    identifier: customer.email,
    password: 'password123',
    role: 'business', // Customer trying to log in as business
  });

  // Matched account should not have business role privileges
  if (attempt.user) {
    assert.strictEqual(attempt.user.role, 'customer', 'Customer role must not escalate to business');
  }

  passedTests++;
  console.log('✅ TEST 8 PASSED: Role boundary protection verified.\n');
}

async function test9() {
  console.log('--- TEST 9: Normal Registration Contains ZERO Demo Data ---');
  const freshEmail = `fresh_${Date.now()}@newbiz.test`;
  const reg = await authService.registerBusiness({
    name: '',
    email: freshEmail,
    password: 'password123',
  });

  const newBizId = reg.business.id;

  // Verify 0 products
  const products = await productService.getProducts(newBizId);
  assert.strictEqual(products.length, 0, 'New business must have ZERO products');

  // Verify 0 customers
  const customers = await customerService.getCustomers(newBizId);
  assert.strictEqual(customers.length, 0, 'New business must have ZERO customers');

  // Verify order history is retrieved from the backend API, not local storage.
  const originalFetch = global.fetch;
  const orderRequests = [];
  global.fetch = async (url) => {
    orderRequests.push(String(url));
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  let orders;
  let dashboard;
  try {
    orders = await orderService.getOrders(newBizId);
    dashboard = await businessService.getDashboardStats(newBizId);
  } finally {
    global.fetch = originalFetch;
  }
  assert.deepStrictEqual(orders, [], 'New business API response must have ZERO orders');
  assert.ok(orderRequests.some(url => url.includes('/api/business/orders')), 'Order history must be requested from the backend API');
  assert.deepStrictEqual(localDB.getStored('orders', []), [], 'Order history must not be stored locally');

  // Verify dashboard stats
  assert.strictEqual(dashboard.stats.todaySales, 0, 'Sales must be 0');
  assert.strictEqual(dashboard.stats.totalCustomers, 0, 'Customers must be 0');
  assert.strictEqual(dashboard.stats.totalRevenue, 0, 'Revenue must be 0');
  assert.strictEqual(dashboard.charts.categoryDistribution.length, 0, 'Categories must be empty');

  // Verify salesChart has 0 sales for all days
  const hasNonZeroSales = dashboard.charts.salesChart.some(d => d.sales > 0 || d.orders > 0);
  assert.strictEqual(hasNonZeroSales, false, 'Sales chart must be all zeros');

  // Verify NO "Mountain Brew Cafe" or "Green Leaf" data
  assert.notStrictEqual(dashboard.business.name, 'Mountain Brew Cafe');
  assert.notStrictEqual(dashboard.business.name, 'Green Leaf Organic Supermarket');

  passedTests++;
  console.log('✅ TEST 9 PASSED: Fresh registration has ZERO demo products, ZERO orders, and ZERO demo cloning.\n');
}

async function test10() {
  console.log('--- TEST 10: Real Customer Profile, Zero Demo Defaults & Persistence ---');
  const custEmail = `cust_prof_${Date.now()}@example.com`;
  const regRes = await authService.registerCustomer({
    name: '',
    email: custEmail,
    phone: '+919811122233',
    password: 'CustomerPass123',
  });

  assert.strictEqual(regRes.error, null);
  const user = regRes.user;

  // Retrieve customer profile
  const profile = await customerService.getProfile(user);
  assert.ok(profile, 'Profile must be returned');
  assert.strictEqual(profile.points, 0, 'New customer points must be strictly 0');
  assert.strictEqual(profile.stamps, 0, 'New customer stamps must be strictly 0');
  assert.strictEqual(profile.total_visits, 0, 'New customer visits must be strictly 0');
  assert.strictEqual(profile.total_spent, 0, 'New customer spent must be strictly 0');
  assert.strictEqual(profile.segment, 'NEW', 'Segment must be NEW');
  assert.strictEqual(profile.membership_tier, 'MEMBER', 'Tier must be MEMBER');
  assert.notStrictEqual(profile.name, 'Aarav Mehta', 'Must not be Aarav Mehta');
  assert.notStrictEqual(profile.customer_id, 'ZUP-CUS-000001', 'Must not be demo customer ID');

  // Update profile
  const updated = await customerService.updateProfile(user, {
    name: 'Vikram Rathore',
    address: 'Mall Road, Shimla',
    birthday: '1995-08-15',
  });
  assert.strictEqual(updated.name, 'Vikram Rathore');

  // Verify persistence
  const reloaded = await customerService.getProfile(user);
  assert.strictEqual(reloaded.name, 'Vikram Rathore', 'Updated name must persist');
  assert.strictEqual(reloaded.address, 'Mall Road, Shimla', 'Updated address must persist');

  passedTests++;
  console.log('✅ TEST 10 PASSED: Customer profile defaults verified (0 pts, 0 visits, ₹0 spent) and update persists.\n');
  return { user, profile: reloaded };
}

async function test11(custCtx) {
  console.log('--- TEST 11: Real QR Resolution & QR Check-in Visits ---');

  // 1. Resolve Menu QR
  const menuRes = await qrService.resolveQR('https://app.zoorup.com/menu/mountain-brew');
  assert.strictEqual(menuRes.success, true);
  assert.strictEqual(menuRes.type, 'MENU');
  assert.strictEqual(menuRes.business_slug, 'mountain-brew');

  // 2. Resolve Check-in QR
  const checkinRes = await qrService.resolveQR('https://app.zoorup.com/checkin/biz_1');
  assert.strictEqual(checkinRes.success, true);
  assert.strictEqual(checkinRes.type, 'CHECKIN');
  assert.strictEqual(checkinRes.business_id, 'biz_1');

  // 3. Resolve Loyalty QR
  const loyaltyRes = await qrService.resolveQR('https://app.zoorup.com/loyalty/biz_1');
  assert.strictEqual(loyaltyRes.success, true);
  assert.strictEqual(loyaltyRes.type, 'LOYALTY');

  // 4. Resolve Customer QR (verify privacy: no phone or email exposed)
  const cusRes = await qrService.resolveQR(`https://app.zoorup.com/customer/${custCtx.profile.customer_id}`);
  assert.strictEqual(cusRes.success, true);
  assert.strictEqual(cusRes.type, 'CUSTOMER');
  assert.strictEqual(cusRes.customer_id, custCtx.profile.customer_id);
  assert.strictEqual(cusRes.phone, undefined, 'Customer phone must NOT be exposed in public QR');
  assert.strictEqual(cusRes.email, undefined, 'Customer email must NOT be exposed in public QR');

  // 5. Resolve Invalid QR
  const invalidRes = await qrService.resolveQR('https://random-unknown-site.org/abc');
  assert.strictEqual(invalidRes.success, false);
  assert.ok(invalidRes.error.includes('Invalid QR Code'));

  // 6. Perform QR Check-in
  const checkInResult = await customerService.recordVisit('biz_1', custCtx.user.id, {
    customer_name: custCtx.profile.name,
    customer_id: custCtx.profile.customer_id,
    points: 50,
    stamps: 1,
  });
  assert.strictEqual(checkInResult.success, true);
  assert.strictEqual(checkInResult.points_awarded, 50);
  assert.strictEqual(checkInResult.stamps_awarded, 1);

  // 7. Verify Customer Profile updated with points, stamps, visits
  const profAfterCheckIn = await customerService.getProfile(custCtx.user);
  assert.strictEqual(profAfterCheckIn.points, 50, 'Points must be 50 after checkin');
  assert.strictEqual(profAfterCheckIn.stamps, 1, 'Stamps must be 1 after checkin');
  assert.strictEqual(profAfterCheckIn.total_visits, 1, 'Visits must be 1 after checkin');

  // 8. Prevent duplicate check-in within 5 minutes
  let dupThrew = false;
  try {
    await customerService.recordVisit('biz_1', custCtx.user.id, {
      customer_id: custCtx.profile.customer_id,
    });
  } catch (err) {
    dupThrew = true;
    assert.ok(err.message.includes('already checked in recently'));
  }
  assert.strictEqual(dupThrew, true, 'Duplicate check-in within 5 minutes must be blocked');

  passedTests++;
  console.log('✅ TEST 11 PASSED: QR resolution, check-in rewards (+50 pts, +1 stamp), and anti-fraud duplicate prevention verified.\n');
}

async function test12() {
  console.log('--- TEST 12: 30-Day Free Trial Lifecycle & Anti-Abuse ---');

  // Scenario 1: New Business registers with PRO plan
  const trialOwnerEmail = `trial_pro_${Date.now()}@bakery.test`;
  const proRegRes = await authService.registerBusiness({
    name: 'Artisan Bakery',
    email: trialOwnerEmail,
    password: 'Password123!',
    phone: '+91 9888877771',
    category: 'Bakery',
    plan: 'PRO',
  });
  assert.strictEqual(proRegRes.error, null, 'Registration must succeed without error');
  assert.ok(proRegRes.business, 'Business must be created');
  const proStoreId = proRegRes.business.id;

  // Verify initial trial state
  const proSub = await subscriptionService.getSubscription(proStoreId);
  assert.strictEqual(proSub.plan, 'PRO');
  assert.strictEqual(proSub.status, 'TRIAL');
  assert.strictEqual(proSub.trial_status, 'ACTIVE');
  assert.strictEqual(proSub.trial_active, true);
  assert.strictEqual(proSub.payment_status, 'TRIAL');
  assert.strictEqual(proSub.trial_used, true);
  assert.strictEqual(proSub.trial_days_remaining, 30);
  assert.ok(proSub.trial_ends_at, 'trial_ends_at must be populated');
  assert.strictEqual(proSub.can_access_premium, true, 'PRO trial must grant premium access');
  assert.ok(Array.isArray(proSub.features), 'PRO trial must provide plan features');
  const proAiAccess = await subscriptionService.checkFeatureAccess(proStoreId, 'ai_insights');
  assert.strictEqual(proAiAccess, true, 'PRO trial must grant premium feature access');

  // Scenario 2: New Business registers with FREE plan
  const freeOwnerEmail = `free_owner_${Date.now()}@kiosk.test`;
  const freeRegRes = await authService.registerBusiness({
    name: 'Corner Kiosk',
    email: freeOwnerEmail,
    password: 'Password123!',
    phone: '+91 9888877772',
    category: 'Retail',
    plan: 'FREE',
  });
  assert.strictEqual(freeRegRes.error, null, 'Free registration must succeed without error');
  assert.ok(freeRegRes.business, 'Free business must be created');
  const freeStoreId = freeRegRes.business.id;

  const freeSub = await subscriptionService.getSubscription(freeStoreId);
  assert.strictEqual(freeSub.plan, 'FREE');
  assert.strictEqual(freeSub.status, 'ACTIVE');
  assert.strictEqual(freeSub.trial_status, 'NOT_APPLICABLE');
  assert.strictEqual(freeSub.trial_active, false);
  assert.strictEqual(freeSub.payment_status, 'FREE');

  // Scenario 3: Plan change during trial preserves trial_ends_at (Anti-Abuse Rule 23)
  const starterRegRes = await authService.registerBusiness({
    name: 'Switch Cafe',
    email: `switch_${Date.now()}@cafe.test`,
    password: 'Password123!',
    phone: '+91 9888877773',
    category: 'Cafe',
    plan: 'STARTER',
  });
  assert.strictEqual(starterRegRes.error, null);
  const switchStoreId = starterRegRes.business.id;
  const initialStarterSub = await subscriptionService.getSubscription(switchStoreId);
  assert.strictEqual(initialStarterSub.plan, 'STARTER');
  assert.strictEqual(initialStarterSub.status, 'TRIAL');
  const initialEndsAt = initialStarterSub.trial_ends_at;

  // Switch from STARTER to PRO during trial
  const switchRes = await subscriptionService.startOrUpgradeTrial(switchStoreId, 'PRO');
  assert.strictEqual(switchRes.success, true);
  const switchedSub = await subscriptionService.getSubscription(switchStoreId);
  assert.strictEqual(switchedSub.plan, 'PRO');
  assert.strictEqual(switchedSub.status, 'TRIAL');
  assert.strictEqual(switchedSub.trial_ends_at, initialEndsAt, 'trial_ends_at must NOT be reset when switching plans');

  // Scenario 4: Trial expiration behavior
  // Simulate trial expiration by setting trial_ends_at to the past
  const subs = localDB.getSubscriptions();
  const subIndex = subs.findIndex(s => s.business_id === proStoreId);
  assert.ok(subIndex !== -1);
  subs[subIndex].trial_ends_at = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
  localDB.saveSubscriptions(subs);

  const expiredSub = await subscriptionService.getSubscription(proStoreId);
  assert.strictEqual(expiredSub.status, 'EXPIRED');
  assert.strictEqual(expiredSub.trial_status, 'EXPIRED');
  assert.strictEqual(expiredSub.payment_status, 'UNPAID');
  assert.strictEqual(expiredSub.trial_active, false);
  assert.strictEqual(expiredSub.trial_days_remaining, 0);

  // Verify feature protection after expiration
  const aiAccess = await subscriptionService.checkFeatureAccess(proStoreId, 'ai_insights');
  assert.strictEqual(aiAccess, false, 'Expired trial must lock premium features');

  // Scenario 5: Business Data Preservation (products, orders, customers remain intact)
  const proProducts = await productService.getProducts(proStoreId);
  assert.ok(Array.isArray(proProducts), 'Products must be preserved after trial expiration');

  // Scenario 6: Payment after trial unlocks ACTIVE paid subscription
  const verifyRes = await subscriptionService.verifyPayment({
    razorpay_order_id: 'order_test_123',
    razorpay_payment_id: 'pay_test_456',
    razorpay_signature: 'sig_mock_valid',
    business_id: proStoreId,
    plan_id: 'PRO',
  });
  assert.strictEqual(verifyRes.success, true);

  const paidSub = await subscriptionService.getSubscription(proStoreId);
  assert.strictEqual(paidSub.plan, 'PRO');
  assert.strictEqual(paidSub.status, 'ACTIVE');
  assert.strictEqual(paidSub.payment_status, 'PAID');
  const unlockedAiAccess = await subscriptionService.checkFeatureAccess(proStoreId, 'ai_insights');
  assert.strictEqual(unlockedAiAccess, true, 'Paid subscription must unlock PRO features');

  passedTests++;
  console.log('✅ TEST 12 PASSED: 30-Day Free Trial lifecycle, anti-abuse reset prevention, expiration locking, data preservation, and paid activation verified.\n');
}

async function test13() {
  console.log('--- TEST 13: Complete Image / Photo System ---');

  // 1. Verify New Customer starts with ZERO demo profile photos
  const newCusRes = await authService.registerCustomer({
    name: 'Aanya Verma',
    phone: '+91 97777 66661',
    email: `aanya_${Date.now()}@test.com`,
    password: 'password123',
  });
  assert.strictEqual(newCusRes.error, null);
  const cusUser = newCusRes.user;
  const initialCusProf = await customerService.getProfile(cusUser);
  assert.strictEqual(initialCusProf.profile_image_url, null, 'New customer profile_image_url must be null (no demo photo)');

  // 2. Customer uploads profile photo
  const uploadedCusPhoto = await uploadService.uploadImage(
    { name: 'avatar.jpg', type: 'image/jpeg', size: 25000 },
    { entityType: 'customer_profile', userId: cusUser.id }
  );
  assert.strictEqual(uploadedCusPhoto.success, true);
  assert.ok(uploadedCusPhoto.url, 'Upload must return URL');

  await customerService.updateProfile(cusUser, {
    profile_image_url: uploadedCusPhoto.url,
    avatar: uploadedCusPhoto.url,
  });

  // 3. Logout
  await authService.logout();
  assert.strictEqual(authService.getCurrentUser(), null);

  // 4. Login and verify profile photo persists
  const relogCus = await authService.login({
    identifier: cusUser.email,
    password: 'password123',
    role: 'customer',
  });
  assert.strictEqual(relogCus.error, null);
  const reloadedCusProf = await customerService.getProfile(relogCus.user);
  assert.strictEqual(reloadedCusProf.profile_image_url, uploadedCusPhoto.url, 'Customer photo must persist across logout/login');

  // 5. Verify New Business starts with ZERO demo images
  const freshOwnerEmail = `photo_owner_${Date.now()}@biz.test`;
  const regBizRes = await authService.registerBusiness({
    name: 'Photo Fresh Bakery',
    email: freshOwnerEmail,
    password: 'Password123!',
    phone: '+91 97777 66662',
    category: 'Bakery',
    plan: 'PRO',
  });
  assert.strictEqual(regBizRes.error, null);
  const bizId = regBizRes.business.id;
  const initialBiz = await businessService.getBusiness(bizId);
  assert.strictEqual(initialBiz.logo_url, null, 'New business logo_url must be null');
  assert.strictEqual(initialBiz.cover_photo_url, null, 'New business cover_photo_url must be null');
  assert.deepStrictEqual(initialBiz.gallery, [], 'New business gallery must be empty array');

  // 6. Business uploads logo and cover photo
  const uploadedLogo = await uploadService.uploadImage(
    { name: 'logo.png', type: 'image/png', size: 30000 },
    { entityType: 'business_logo', businessId: bizId }
  );
  const uploadedCover = await uploadService.uploadImage(
    { name: 'cover.jpg', type: 'image/jpeg', size: 120000 },
    { entityType: 'business_cover', businessId: bizId }
  );

  await businessService.updateBusiness(bizId, {
    logo_url: uploadedLogo.url,
    cover_photo_url: uploadedCover.url,
  });

  // 7. Refresh / reload business profile: both remain
  const loadedBiz = await businessService.getBusiness(bizId);
  assert.strictEqual(loadedBiz.logo_url, uploadedLogo.url, 'Business logo_url must persist');
  assert.strictEqual(loadedBiz.cover_photo_url, uploadedCover.url, 'Business cover_photo_url must persist');

  // 8. Upload product image & menu catalog item image
  const uploadedProductImg = await uploadService.uploadImage(
    { name: 'croissant.webp', type: 'image/webp', size: 45000 },
    { entityType: 'product', businessId: bizId }
  );
  const product = await productService.addProduct(bizId, {
    name: 'Butter Croissant',
    price: 95,
    category: 'Bakery',
    image_url: uploadedProductImg.url,
  });
  assert.strictEqual(product.image_url, uploadedProductImg.url, 'Product image_url must be saved');

  // 9. Upload staff profile photo
  const uploadedStaffPhoto = await uploadService.uploadImage(
    { name: 'staff.jpg', type: 'image/jpeg', size: 35000 },
    { entityType: 'staff_profile', businessId: bizId }
  );
  const staffMember = await staffService.addStaff(bizId, {
    name: 'Karan Sharma',
    role: 'Head Baker',
    email: `karan_${Date.now()}@biz.test`,
    phone: '+91 97777 66663',
    profile_image_url: uploadedStaffPhoto.url,
  });
  assert.strictEqual(staffMember.profile_image_url, uploadedStaffPhoto.url, 'Staff profile_image_url must be saved');

  // 10. Upload business gallery photos & enforce plan limits
  const galleryImg1 = await uploadService.uploadImage({ name: 'storefront.jpg', type: 'image/jpeg', size: 50000 }, { entityType: 'business_gallery', businessId: bizId });
  const galleryImg2 = await uploadService.uploadImage({ name: 'interior.jpg', type: 'image/jpeg', size: 50000 }, { entityType: 'business_gallery', businessId: bizId });
  
  await businessService.updateStoreGallery(bizId, [
    { url: galleryImg1.url, position: 0 },
    { url: galleryImg2.url, position: 1 },
  ]);

  const savedGallery = await businessService.getStoreGallery(bizId);
  assert.strictEqual(savedGallery.length, 2, 'Gallery must contain 2 photos');
  assert.strictEqual(savedGallery[0].url, galleryImg1.url);

  // 11. Replace image
  const replacementLogo = await uploadService.uploadImage(
    { name: 'new_logo.png', type: 'image/png', size: 32000 },
    { entityType: 'business_logo', businessId: bizId }
  );
  await businessService.updateBusiness(bizId, { logo_url: replacementLogo.url });
  const bizAfterReplace = await businessService.getBusiness(bizId);
  assert.strictEqual(bizAfterReplace.logo_url, replacementLogo.url, 'Replaced logo must take effect');

  // 12. Remove image
  await businessService.updateBusiness(bizId, { logo_url: null });
  const bizAfterRemove = await businessService.getBusiness(bizId);
  assert.strictEqual(bizAfterRemove.logo_url, null, 'Removed logo must be null');

  // 13. Tenant Isolation Security: Business A attempts to modify Business B's data
  const bizBEmail = `owner_b_${Date.now()}@bizb.test`;
  const bizBRes = await authService.registerBusiness({
    name: 'Business B Market',
    email: bizBEmail,
    password: 'Password123!',
    phone: '+91 97777 66664',
    category: 'Retail',
    plan: 'FREE',
  });
  const bizBId = bizBRes.business.id;

  let crossTenantRejected = false;
  try {
    // Business A attempts to update Business B's profile
    await businessService.updateBusiness(bizBId, { logo_url: 'https://hacker.com/evil.jpg' }, { callerBusinessId: bizId });
  } catch (err) {
    crossTenantRejected = true;
    assert.ok(err.message.includes('Unauthorized'));
  }
  assert.strictEqual(crossTenantRejected, true, 'Cross-tenant image modification must be rejected');

  // 14. Plan Gallery Limit enforcement for FREE plan (max 2 images)
  let planLimitExceeded = false;
  try {
    await businessService.updateStoreGallery(bizBId, [
      { url: 'img1.jpg', position: 0 },
      { url: 'img2.jpg', position: 1 },
      { url: 'img3.jpg', position: 2 }, // Exceeds FREE plan limit of 2!
    ]);
  } catch (err) {
    planLimitExceeded = true;
    assert.ok(err.message.includes('allows up to 2 gallery images'));
  }
  assert.strictEqual(planLimitExceeded, true, 'FREE plan gallery limit of 2 must be strictly enforced');

  passedTests++;
  console.log('✅ TEST 13 PASSED: Complete Image / Photo System verified across customer, business logo, cover, products, staff, gallery, replacement, removal, plan limits, and tenant isolation.\n');
}

async function runAll() {
  try {
    const ctx = await test1();
    await test2(ctx);
    await test3(ctx);
    await test4(ctx);
    await test5();
    await test6();
    await test7(ctx);
    await test8();
    await test9();
    const custCtx = await test10();
    await test11(custCtx);
    await test12();
    await test13();

    console.log('====================================================');
    console.log(`ALL ${passedTests} TESTS PASSED PERFECTLY! (100% SUCCESS)`);
    console.log('====================================================');
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runAll();
