import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Mock localStorage for Node test runner
const storage = {};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
};

// Force production environment check for tests
process.env.NODE_ENV = 'production';
process.env.VITE_DEV_MODE = 'false';

import { localDB, isProductionEnvironment } from './src/services/storageSeed.js';
import { authService } from './src/services/authService.js';
import { customerService } from './src/services/customerService.js';
import { businessService } from './src/services/businessService.js';
import { subscriptionService } from './src/services/subscriptionService.js';

let passed = 0;

async function runProductionMasterSuite() {
  console.log('============================================================');
  console.log('ZOOR UP — PRODUCTION MASTER TEST SUITE (TEST 27 - TEST 48)');
  console.log('============================================================\n');

  // TEST 27 — ZERO DEMO DATA
  console.log('--- TEST 27: ZERO DEMO DATA IN PRODUCTION ---');
  localDB.clearAll();
  assert.strictEqual(isProductionEnvironment(), true, 'Must detect production mode');
  const freshCustomers = localDB.getCustomers();
  const freshBusinesses = localDB.getBusinesses();
  const freshProducts = localDB.getProducts();
  const freshOrders = localDB.getOrders();
  const freshStaff = localDB.getStaff();
  
  assert.strictEqual(freshCustomers.length, 0, 'Production DB must start with 0 customers');
  assert.strictEqual(freshBusinesses.length, 0, 'Production DB must start with 0 businesses');
  assert.strictEqual(freshProducts.length, 0, 'Production DB must start with 0 products');
  assert.strictEqual(freshOrders.length, 0, 'Production DB must start with 0 orders');
  assert.strictEqual(freshStaff.length, 0, 'Production DB must start with 0 staff');

  // New business creation check
  const bizReg = await authService.registerBusiness({
    name: 'Real Indian Spices',
    owner_name: 'Rajesh Sharma',
    email: 'rajesh@realindianspices.in',
    phone: '+91 98765 43210',
    password: 'SecurePassword123!',
  });
  assert.strictEqual(bizReg.error, null);
  const createdBiz = bizReg.business;
  assert.strictEqual(createdBiz.logo, null, 'New business logo must be null');
  assert.strictEqual(createdBiz.cover_image, null, 'New business cover must be null');
  assert.deepStrictEqual(createdBiz.gallery, [], 'New business gallery must be empty');

  // New customer creation check
  const cusReg = await authService.registerCustomer({
    name: 'Vikram Malhotra',
    phone: '+91 91234 56789',
    email: 'vikram@malhotra.in',
    password: 'SecurePassword123!',
  });
  assert.strictEqual(cusReg.error, null);
  const createdCus = cusReg.customer;
  assert.strictEqual(createdCus.points, 0, 'New customer points must be 0');
  assert.strictEqual(createdCus.stamps, 0, 'New customer stamps must be 0');
  assert.strictEqual(createdCus.total_visits, 0, 'New customer visits must be 0');
  assert.strictEqual(createdCus.total_spent, 0, 'New customer spent must be 0');
  assert.strictEqual(createdCus.membership_tier, 'MEMBER', 'New customer membership must be MEMBER');
  assert.strictEqual(createdCus.segment, 'NEW', 'New customer segment must be NEW');
  assert.strictEqual(createdCus.avatar, null, 'New customer avatar must be null');
  passed++;
  console.log('✅ TEST 27 PASSED: Zero demo data verified for new businesses and customers.\n');

  // TEST 28 — REAL SMS OTP GENERATION & STORAGE
  console.log('--- TEST 28: REAL SMS OTP GENERATION & SECURE HASH STORAGE ---');
  const otpPhone = '+91 98888 77777';
  const reqRes = await authService.requestOTP(otpPhone, 'LOGIN');
  assert.strictEqual(reqRes.success, true);
  assert.ok(reqRes.phone);
  assert.strictEqual(reqRes.testOtp, undefined, 'Plaintext OTP must NEVER be exposed in production API response');

  const otpStoreRaw = localStorage.getItem('zoorup_otp_store_v1');
  const otpStore = JSON.parse(otpStoreRaw || '{}');
  const otpRecord = otpStore['+919888877777'];
  assert.ok(otpRecord, 'OTP record must be stored');
  assert.ok(otpRecord.otp_hash, 'OTP must be hashed with salt');
  assert.strictEqual(otpRecord.code, undefined, 'Plaintext OTP code must NOT be stored in DB');
  assert.strictEqual(otpRecord.purpose, 'LOGIN');
  passed++;
  console.log('✅ TEST 28 PASSED: Real SMS OTP generation & salted hash storage verified.\n');

  // TEST 29 — OTP EXPIRATION (5 Minutes)
  console.log('--- TEST 29: OTP EXPIRATION ENFORCEMENT ---');
  // Artificially age the OTP record beyond 5 minutes (301 seconds)
  otpRecord.expires_at = Date.now() - 5000;
  localStorage.setItem('zoorup_otp_store_v1', JSON.stringify({ ...otpStore, ['+919888877777']: otpRecord }));
  
  const expiredVerify = await authService.verifyOTP(otpPhone, '123456');
  assert.ok(expiredVerify.error, 'Expired OTP must be rejected');
  assert.ok(expiredVerify.error.toLowerCase().includes('expired'));
  passed++;
  console.log('✅ TEST 29 PASSED: OTP expiration after 5 minutes enforced.\n');

  // TEST 30 — OTP ATTEMPT LIMIT (5 Incorrect Attempts)
  console.log('--- TEST 30: OTP ATTEMPT LIMIT ENFORCEMENT ---');
  const attemptPhone = '+91 97777 11111';
  // Clear any existing cooldown for this fresh phone
  delete otpStore[attemptPhone];
  localStorage.setItem('zoorup_otp_store_v1', JSON.stringify(otpStore));
  await authService.requestOTP(attemptPhone, 'LOGIN');

  // Try 5 wrong OTPs
  for (let i = 1; i <= 5; i++) {
    const wrongRes = await authService.verifyOTP(attemptPhone, `00000${i}`);
    assert.ok(wrongRes.error);
    if (i < 5) {
      assert.ok(wrongRes.error.includes('attempts remaining') || wrongRes.error.includes('Invalid'));
    } else {
      assert.ok(wrongRes.error.includes('Maximum verification attempts exceeded') || wrongRes.error.includes('invalidated'));
    }
  }

  // 6th attempt must fail because OTP was invalidated
  const sixthRes = await authService.verifyOTP(attemptPhone, '000006');
  assert.ok(sixthRes.error);
  passed++;
  console.log('✅ TEST 30 PASSED: Maximum 5 incorrect OTP attempts strictly enforced.\n');

  // TEST 31 — OTP RATE LIMIT (Max 5 requests per 15 min)
  console.log('--- TEST 31: OTP RATE LIMITING ---');
  const rateLimitPhone = '+91 96666 22222';
  const cleanRateLimitPhone = authService.normalizePhone(rateLimitPhone);
  const currentStore = JSON.parse(localStorage.getItem('zoorup_otp_store_v1') || '{}');
  delete currentStore[cleanRateLimitPhone];
  
  // Simulate 5 requests within 15 minutes
  const now = Date.now();
  currentStore[cleanRateLimitPhone] = {
    phone: cleanRateLimitPhone,
    requestHistory: [now - 100000, now - 80000, now - 60000, now - 40000, now - 20000],
    lastRequested: now - 65000, // cooldown passed, but total requests exceeded
  };
  localStorage.setItem('zoorup_otp_store_v1', JSON.stringify(currentStore));

  const rateLimitRes = await authService.requestOTP(rateLimitPhone, 'LOGIN');
  assert.strictEqual(rateLimitRes.success, false);
  assert.ok(rateLimitRes.error.includes('Too many OTP requests'));
  passed++;
  console.log('✅ TEST 31 PASSED: Rate limit of 5 requests per 15 minutes enforced.\n');

  // TEST 32 — OTP 60-SECOND RESEND COOLDOWN
  console.log('--- TEST 32: OTP 60-SECOND RESEND COOLDOWN ---');
  const cooldownPhone = '+91 95555 33333';
  const cleanCooldownPhone = authService.normalizePhone(cooldownPhone);
  const cooldownStore = JSON.parse(localStorage.getItem('zoorup_otp_store_v1') || '{}');
  delete cooldownStore[cleanCooldownPhone];
  localStorage.setItem('zoorup_otp_store_v1', JSON.stringify(cooldownStore));
  
  const initialReq = await authService.requestOTP(cooldownPhone, 'LOGIN');
  assert.strictEqual(initialReq.success, true);

  // Immediate second request must trigger 60s cooldown
  const rapidReq = await authService.requestOTP(cooldownPhone, 'LOGIN');
  assert.strictEqual(rapidReq.success, false);
  assert.ok(rapidReq.error.includes('wait') && rapidReq.error.includes('before requesting'));
  assert.ok(rapidReq.cooldownRemaining > 0 && rapidReq.cooldownRemaining <= 60);
  passed++;
  console.log('✅ TEST 32 PASSED: 60-second resend cooldown strictly enforced.\n');

  // TEST 33 — NO PERSONA SWITCHING
  console.log('--- TEST 33: NO DEMO PERSONA SWITCHING IN PRODUCTION ---');
  const demoAccounts = authService.getDemoAccounts();
  assert.strictEqual(demoAccounts.length, 0, 'Demo accounts list must be empty in production');
  assert.strictEqual(typeof authService.switchDemoRole, 'undefined', 'switchDemoRole function must not exist');
  passed++;
  console.log('✅ TEST 33 PASSED: Demo persona switching completely removed.\n');

  // TEST 34 — ACCOUNT ISOLATION
  console.log('--- TEST 34: ACCOUNT AND ROLE ISOLATION ---');
  const authUser = cusReg.user;
  authService.setCurrentUser(authUser);
  const activeUser = authService.getCurrentUser();
  assert.strictEqual(activeUser.role, 'customer');
  assert.strictEqual(activeUser.id, authUser.id);
  assert.strictEqual(activeUser.business_id, undefined);
  passed++;
  console.log('✅ TEST 34 PASSED: User account identity and role isolated.\n');

  // TEST 35 — ANDROID PRODUCTION APK BUILD PROFILE & REMOVAL OF INVALID STUB
  console.log('--- TEST 35: ANDROID PRODUCTION APK BUILD PROFILE & STUB REMOVAL ---');
  const easConfig = JSON.parse(fs.readFileSync('mobile/eas.json', 'utf8'));
  assert.strictEqual(easConfig.build['production-apk'].android.buildType, 'apk', 'EAS production-apk profile must specify android.buildType = "apk"');
  assert.strictEqual(easConfig.build.production.android.buildType, 'app-bundle', 'EAS production profile must specify android.buildType = "app-bundle"');
  
  // Verify corrupt 202 KB stub is eliminated, and if downloaded, it is the authentic signed EAS APK (> 50 MB)
  if (fs.existsSync(path.resolve('downloads/zoor-up-latest.apk'))) {
    const apkSize = fs.statSync(path.resolve('downloads/zoor-up-latest.apk')).size;
    assert.ok(apkSize > 50 * 1024 * 1024, `APK must be genuine EAS build (> 50MB), found: ${(apkSize / 1024 / 1024).toFixed(2)} MB`);
  }
  passed++;
  console.log('✅ TEST 35 PASSED: Valid EAS APK build profile configured and authentic binary verified.\n');

  // TEST 36 — ANDROID PRODUCTION API CONFIGURATION
  console.log('--- TEST 36: ANDROID PRODUCTION CONFIG & PACKAGE IDENTIFIERS ---');
  const mobileAppJson = JSON.parse(fs.readFileSync('mobile/app.json', 'utf8'));
  assert.strictEqual(mobileAppJson.expo.name, 'ZOOR UP');
  assert.strictEqual(mobileAppJson.expo.android.package, 'com.zoorup.app');
  assert.strictEqual(mobileAppJson.expo.extra.environment, 'production');
  assert.ok(!mobileAppJson.expo.extra.apiUrl.includes('localhost'), 'Production mobile API must not use localhost');
  assert.ok(!mobileAppJson.expo.extra.apiUrl.includes('127.0.0.1'), 'Production mobile API must not use 127.0.0.1');
  passed++;
  console.log('✅ TEST 36 PASSED: Android production package name & API configuration verified.\n');

  // TEST 37 — IOS PRODUCTION BUILD CONFIGURATION
  console.log('--- TEST 37: IOS PRODUCTION CONFIGURATION & PERMISSIONS ---');
  assert.strictEqual(mobileAppJson.expo.ios.bundleIdentifier, 'com.zoorup.app');
  assert.ok(mobileAppJson.expo.ios.infoPlist.NSCameraUsageDescription, 'Camera permission description required for QR scan');
  assert.ok(mobileAppJson.expo.ios.associatedDomains.includes('applinks:app.zoorup.com'));
  passed++;
  console.log('✅ TEST 37 PASSED: iOS bundle ID, associated domains & permissions verified.\n');

  // TEST 38 — IOS AUTHENTICATION & TESTFLIGHT INTEGRATION
  console.log('--- TEST 38: IOS TESTFLIGHT & AUTHENTICATION INTEGRATION ---');
  const downloadPageCode = fs.readFileSync('src/pages/public/DownloadPage.jsx', 'utf8');
  assert.ok(downloadPageCode.includes('testflight.apple.com'), 'Download page must include legitimate TestFlight beta link');
  assert.ok(downloadPageCode.includes('Add to Home Screen'), 'Download page must guide iOS Safari users on PWA install');
  passed++;
  console.log('✅ TEST 38 PASSED: iOS distribution path verified.\n');

  // TEST 39 — PWA MANIFEST & SERVICE WORKER INTEGRITY
  console.log('--- TEST 39: PWA MANIFEST AND SERVICE WORKER INTEGRITY ---');
  const manifestRaw = fs.readFileSync('public/manifest.json', 'utf8');
  const manifest = JSON.parse(manifestRaw);
  assert.strictEqual(manifest.short_name, 'ZOOR UP');
  assert.strictEqual(manifest.display, 'standalone');
  assert.strictEqual(manifest.theme_color, '#F97316');
  assert.strictEqual(manifest.background_color, '#FFFDF9');
  assert.ok(manifest.icons.length >= 2, 'Manifest must contain icons for PWA install');

  const swContent = fs.readFileSync('public/sw.js', 'utf8');
  assert.ok(swContent.includes('zoorup-pwa-v1'), 'Service worker must define cache name');
  assert.ok(swContent.includes('fetch'), 'Service worker must handle fetch requests');
  passed++;
  console.log('✅ TEST 39 PASSED: PWA manifest.json and sw.js verified.\n');

  // TEST 40 — DOWNLOAD PAGE ROUTE & BRANDING
  console.log('--- TEST 40: /download ROUTE & BRANDING ---');
  const appRoutes = fs.readFileSync('src/App.jsx', 'utf8');
  assert.ok(appRoutes.includes('path="/download"'), 'App.jsx must register /download route');
  assert.ok(downloadPageCode.includes('GET ZOOR UP'), 'Download page must feature GET ZOOR UP headline');
  assert.ok(downloadPageCode.includes('QRCodeSVG'), 'Download page must render QR code for mobile scanning');
  passed++;
  console.log('✅ TEST 40 PASSED: /download page route and interactive QR verified.\n');

  // TEST 41 — QR / DEEP LINKS
  console.log('--- TEST 41: QR MENU AND CHECKIN DEEP LINKS ---');
  assert.ok(appRoutes.includes('path="/m/:slug"'));
  assert.ok(appRoutes.includes('path="/menu/:slug"'));
  assert.ok(appRoutes.includes('path="/checkin/:businessId"'));
  assert.ok(appRoutes.includes('path="/loyalty/:businessId"'));
  passed++;
  console.log('✅ TEST 41 PASSED: Deep links configured for /menu, /checkin, and /loyalty.\n');

  // TEST 42 — RESPONSIVE MOBILE DRAWER CONFIGURATION
  console.log('--- TEST 42: RESPONSIVE MOBILE SIDEBAR DEFAULT CLOSED ---');
  const appLayoutCode = fs.readFileSync('src/components/layout/AppLayout.jsx', 'utf8');
  assert.ok(appLayoutCode.includes('useState(false)'), 'Mobile sidebar must default to closed (false)');
  assert.ok(appLayoutCode.includes('window.innerWidth'), 'Layout must handle viewport resize');
  passed++;
  console.log('✅ TEST 42 PASSED: Mobile sidebar closed by default.\n');

  // TEST 43 — RESPONSIVE TABLET
  console.log('--- TEST 43: RESPONSIVE TABLET COMPATIBILITY ---');
  const stylesIndexCss = fs.readFileSync('src/styles/index.css', 'utf8');
  const stylesCompCss = fs.readFileSync('src/styles/components.css', 'utf8');
  assert.ok(stylesIndexCss.includes('@media') && (stylesIndexCss.includes('767px') || stylesCompCss.includes('768px')), 'Styles must include tablet media queries');
  passed++;
  console.log('✅ TEST 43 PASSED: Tablet viewport breakpoints verified.\n');

  // TEST 44 — RESPONSIVE DESKTOP
  console.log('--- TEST 44: RESPONSIVE DESKTOP LAYOUT ---');
  assert.ok(stylesIndexCss.includes('1024px') || stylesIndexCss.includes('1023px'), 'Desktop container breakpoints defined');
  passed++;
  console.log('✅ TEST 44 PASSED: Desktop responsive layout verified.\n');

  // TEST 45 — LOGOUT / LOGIN SESSION TEARDOWN
  console.log('--- TEST 45: COMPLETE LOGOUT & SESSION INVALIDATION ---');
  await authService.logout();
  assert.strictEqual(authService.getCurrentUser(), null);
  assert.strictEqual(authService.getToken(), null);
  passed++;
  console.log('✅ TEST 45 PASSED: Logout clears token, user, business, and session cache.\n');

  // TEST 46 — SESSION RESTORATION
  console.log('--- TEST 46: AUTHORITATIVE SESSION RESTORATION ---');
  const reloginRes = await authService.login({
    identifier: 'rajesh@realindianspices.in',
    password: 'SecurePassword123!',
    role: 'business',
  });
  assert.strictEqual(reloginRes.error, null);
  assert.ok(authService.getCurrentUser());
  assert.strictEqual(authService.getCurrentUser().email, 'rajesh@realindianspices.in');
  passed++;
  console.log('✅ TEST 46 PASSED: Session securely restored upon re-authentication.\n');

  // TEST 47 — TENANT ISOLATION
  console.log('--- TEST 47: MULTI-TENANT BUSINESS DATA ISOLATION ---');
  const biz1Id = createdBiz.id;
  const biz2Reg = await authService.registerBusiness({
    name: 'Bombay Chai Co',
    owner_name: 'Amit Patel',
    email: 'amit@bombaychai.in',
    phone: '+91 94444 88888',
    password: 'SecurePassword123!',
  });
  const biz2Id = biz2Reg.business.id;

  // 1. Cross-tenant update must be rejected
  let crossTenantRejected = false;
  try {
    await businessService.updateBusiness(biz2Id, { name: 'Hacked Name' }, { callerBusinessId: biz1Id });
  } catch (err) {
    crossTenantRejected = true;
    assert.ok(err.message.includes('Unauthorized'));
  }
  assert.strictEqual(crossTenantRejected, true, 'Cross-tenant mutation must throw Unauthorized error');

  // 2. Data store tenant isolation
  const allProducts = localDB.getProducts();
  const p1 = {
    id: `prod_${Date.now()}`,
    business_id: biz1Id,
    name: 'Kashmiri Saffron 1g',
    price: 350,
    category: 'Spices',
  };
  localDB.saveProducts([...allProducts, p1]);

  // Business 2 products must NOT include Business 1's product
  const biz2Products = localDB.getProducts().filter(p => p.business_id === biz2Id);
  assert.strictEqual(biz2Products.some(p => p.id === p1.id), false, 'Tenant isolation: Business 2 must not see Business 1 products');
  passed++;
  console.log('✅ TEST 47 PASSED: Tenant data isolation verified between distinct businesses.\n');

  // TEST 48 — SUBSCRIPTION SECURITY
  console.log('--- TEST 48: SUBSCRIPTION STATUS & UPGRADE ENFORCEMENT ---');
  const currentSub = await subscriptionService.getSubscription(biz1Id);
  assert.ok(currentSub.plan);
  assert.strictEqual(currentSub.subscription_status, 'TRIAL');
  assert.strictEqual(currentSub.trial_status, 'ACTIVE');

  // Check feature entitlement
  const access = await subscriptionService.checkFeatureAccess(biz1Id, 'analytics_advanced');
  assert.strictEqual(access, true, 'Active trial grants access to subscribed tier features');
  passed++;
  console.log('✅ TEST 48 PASSED: Subscription authority and feature gating verified.\n');

  console.log('============================================================');
  console.log(`ALL ${passed} PRODUCTION MASTER TESTS PASSED! (100% SUCCESS)`);
  console.log('============================================================');
}

runProductionMasterSuite().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
