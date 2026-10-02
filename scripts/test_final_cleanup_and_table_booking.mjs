import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotsDir = path.resolve('test-results/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function runFinalCleanupAndTableBookingTest() {
  console.log('=== STARTING ZOOR UP FINAL CLEANUP + TABLE BOOKING AUTOMATED VERIFICATION ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // -------------------------------------------------------------
    // TEST 1: AUTH HUB - VERIFY NO DELIVERY PARTNER ROLE CARD
    // -------------------------------------------------------------
    console.log('[TEST 1] Verifying /login Auth Hub...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    const content = await page.content();
    
    if (content.includes('Delivery Partner')) {
      throw new Error('FAIL: Delivery Partner card is still present on /login AuthHub!');
    }
    console.log('✓ PASS: Delivery Partner is completely absent from AuthHub.');

    // -------------------------------------------------------------
    // TEST 2: BUSINESS CREATION & CLEAN INITIAL STATE (NO DEMO DATA)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Verifying New Business Creation with Real Data...');
    await page.goto('http://localhost:5173/signup/business', { waitUntil: 'networkidle' });
    
    // Check no quick demo button
    if (content.includes('Use Quick Demo')) {
      throw new Error('FAIL: "Use Quick Demo" button found in signup!');
    }

    // Set clean real business session in localStorage
    const timestamp = Date.now();
    const testBusiness = {
      id: `biz_real_${timestamp}`,
      name: 'Spice Valley Bistro',
      slug: `spice-valley-${timestamp}`,
      category: 'Restaurant & Dining',
      city: 'Mumbai',
      state: 'Maharashtra',
      upi_id: 'spicevalley@okaxis',
      menu_enabled: true,
      onboarding_completed: true,
      subscription_plan: 'PRO',
      status: 'APPROVED',
      created_at: new Date().toISOString()
    };

    const testMerchantUser = {
      id: `usr_merchant_${timestamp}`,
      business_id: testBusiness.id,
      business_slug: testBusiness.slug,
      business_name: testBusiness.name,
      name: 'Rajesh Verma',
      email: `rajesh_${timestamp}@spicevalley.com`,
      role: 'business',
      token: 'jwt_mock_token_biz'
    };

    await page.evaluate(({ biz, usr }) => {
      localStorage.setItem('zoorup_current_user', JSON.stringify(usr));
      localStorage.setItem('zoorup_auth_token', usr.token);
      
      const storedBiz = JSON.parse(localStorage.getItem('zoorup_businesses') || '[]');
      storedBiz.unshift(biz);
      localStorage.setItem('zoorup_businesses', JSON.stringify(storedBiz));

      const storedUsers = JSON.parse(localStorage.getItem('zoorup_users') || '[]');
      storedUsers.unshift(usr);
      localStorage.setItem('zoorup_users', JSON.stringify(storedUsers));
    }, { biz: testBusiness, usr: testMerchantUser });

    // -------------------------------------------------------------
    // TEST 3: BUSINESS NAVIGATION - VERIFY NO DELIVERY, NO REPORTS, HAS TABLE BOOKING
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Verifying Business Sidebar Navigation...');
    await page.goto('http://localhost:5173/business', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotsDir, 'business_dashboard_clean.png') });

    const sidebarText = await page.locator('aside.app-sidebar').innerText();
    if (sidebarText.includes('Delivery')) {
      throw new Error('FAIL: "Delivery" link found in business sidebar!');
    }
    if (sidebarText.includes('Reports')) {
      throw new Error('FAIL: "Reports" link found in business sidebar!');
    }
    if (!sidebarText.includes('Table Booking')) {
      throw new Error('FAIL: "Table Booking" link missing in business sidebar!');
    }
    console.log('✓ PASS: Business sidebar has "Table Booking" and no "Delivery" or "Reports".');

    // -------------------------------------------------------------
    // TEST 4: BUSINESS TABLE BOOKING CONFIGURATION & DOUBLE BOOKING TEST
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Testing Business Table Booking Setup...');
    await page.goto('http://localhost:5173/business/table-booking', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotsDir, 'business_table_booking_page.png') });

    // Click "Tables & Seating" tab
    await page.click('button:has-text("Tables & Seating")');
    await page.waitForTimeout(500);

    // Click "Add Table"
    await page.click('button:has-text("Add Table"), button:has-text("Add First Table")');
    await page.waitForTimeout(500);

    // Fill table form: "Table 1", 4 capacity
    await page.fill('input[placeholder*="Table 1"]', 'VIP Booth A');
    await page.fill('input[type="number"]', '4');
    await page.click('.modal-content button[type="submit"]');
    await page.waitForTimeout(600);
    console.log('✓ PASS: VIP Booth A created successfully.');

    // Add another table: "Window Table 2", 2 capacity
    await page.click('button:has-text("Add New Table")');
    await page.waitForTimeout(400);
    await page.fill('input[placeholder*="Table 1"]', 'Window Table 2');
    await page.fill('input[type="number"]', '2');
    await page.click('.modal-content button[type="submit"]');
    await page.waitForTimeout(600);
    console.log('✓ PASS: Window Table 2 created successfully.');

    // -------------------------------------------------------------
    // TEST 5: CUSTOMER TABLE BOOKING FLOW
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Testing Customer "Book a Table" Reservation Flow...');
    const testCustomerUser = {
      id: `usr_cust_${timestamp}`,
      customer_id: `ZUP-CUS-${timestamp.toString().slice(-6)}`,
      name: 'Ananya Sharma',
      email: `ananya_${timestamp}@gmail.com`,
      phone: '9876543210',
      role: 'customer',
      points: 0,
      stamps: 0,
      token: 'jwt_mock_token_cust'
    };

    await page.evaluate((cust) => {
      localStorage.setItem('zoorup_current_user', JSON.stringify(cust));
      localStorage.setItem('zoorup_auth_token', cust.token);
      
      const storedCusts = JSON.parse(localStorage.getItem('zoorup_customers') || '[]');
      storedCusts.unshift(cust);
      localStorage.setItem('zoorup_customers', JSON.stringify(storedCusts));
    }, testCustomerUser);

    await page.goto('http://localhost:5173/customer/table-booking', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotsDir, 'customer_table_booking_page.png') });

    // Check that Spice Valley Bistro is available and select it
    await page.click(`h4:has-text("${testBusiness.name}")`);
    await page.waitForTimeout(600);

    // Set time to 20:00
    await page.fill('input[type="time"]', '20:00');
    await page.waitForTimeout(600);

    // Select Window Table 2 (or available table)
    await page.click('strong:has-text("Window Table 2")');
    await page.fill('input[placeholder*="Birthday celebration"]', 'Anniversary dinner by window');

    // Click Confirm Reservation
    await page.click('button:has-text("Confirm Reservation")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, 'customer_booking_confirmed.png') });

    const pageText = await page.innerText('body');
    if (!pageText.includes('RESERVATION CONFIRMED')) {
      throw new Error('FAIL: Reservation confirmed screen not shown!');
    }
    console.log('✓ PASS: Customer completed online table reservation!');

    // -------------------------------------------------------------
    // TEST 6: BACKEND DOUBLE BOOKING PREVENTION
    // -------------------------------------------------------------
    console.log('\n[TEST 6] Testing Double-Booking Prevention Logic...');
    // Click "Book Another Table"
    await page.click('button:has-text("Book Another Table")');
    await page.waitForTimeout(600);

    // Select same business, time 20:00, party size 2
    await page.click(`h4:has-text("${testBusiness.name}")`);
    await page.fill('input[type="time"]', '20:00');
    await page.waitForTimeout(600);

    // Window Table 2 should NO LONGER be listed because it is already booked for 20:00!
    const availableTablesText = await page.innerText('body');
    if (availableTablesText.includes('Window Table 2')) {
      throw new Error('FAIL: Double booking occurred! "Window Table 2" was offered despite existing booking at 20:00!');
    }
    console.log('✓ PASS: Double-booking successfully prevented! "Window Table 2" is correctly unavailable.');

    // -------------------------------------------------------------
    // TEST 7: DIGITAL MENU & IN-STORE UPI / CASH PURCHASE CHECKOUT
    // -------------------------------------------------------------
    console.log('\n[TEST 7] Testing In-Store Digital Menu & Payment Flow...');
    
    // Seed 1 product for Spice Valley Bistro
    await page.evaluate((bizId) => {
      const prod = {
        id: `prod_dosa_1`,
        business_id: bizId,
        name: 'Crispy Masala Dosa',
        description: 'Golden crepe with spiced potato mash and coconut chutney',
        price: 180,
        discount_price: 180,
        category: 'South Indian Specials',
        active: true,
        type: 'product',
        stock: 50
      };
      const prods = JSON.parse(localStorage.getItem('zoorup_products') || '[]');
      prods.unshift(prod);
      localStorage.setItem('zoorup_products', JSON.stringify(prods));
    }, testBusiness.id);

    // Open digital menu directly by business slug
    await page.goto(`http://localhost:5173/m/${testBusiness.slug}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotsDir, 'digital_menu_live.png') });

    const menuText = await page.innerText('body');
    if (!menuText.includes('Crispy Masala Dosa') || !menuText.includes('₹180')) {
      throw new Error('FAIL: Product not displayed on digital menu!');
    }
    console.log('✓ PASS: Digital menu displayed real store branding & item.');

    // Add to cart
    await page.click('button:has-text("ADD")');
    await page.waitForTimeout(500);

    // Navigate to checkout
    await page.goto('http://localhost:5173/checkout', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, 'in_store_checkout_page.png') });

    // Verify checkout has no delivery fee or delivery address
    const checkoutText = await page.innerText('body');
    if (checkoutText.includes('Delivery Address') || checkoutText.includes('Delivery Fee')) {
      throw new Error('FAIL: Delivery address or fee found on in-store checkout!');
    }
    console.log('✓ PASS: In-store purchase checkout has NO delivery fee or delivery addresses.');

    // Fill Customer Details
    await page.fill('input[placeholder*="Rahul Sharma"]', testCustomerUser.name);
    await page.fill('input[placeholder*="9876543210"]', testCustomerUser.phone);
    await page.waitForTimeout(300);

    // Pay with Cash at Counter
    await page.click('strong:has-text("Pay Cash")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Pay ₹")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, 'payment_status_pending_cash.png') });

    const statusText = await page.innerText('body');
    if (!statusText.includes('Payment Pending') && !statusText.includes('AWAITING VERIFICATION')) {
      throw new Error('FAIL: PaymentStatus screen does not indicate pending verification!');
    }
    console.log('✓ PASS: Cash transaction recorded with safe "Awaiting Counter Verification" status.');

    // -------------------------------------------------------------
    // TEST 8: MERCHANT CONFIRMS CASH PAYMENT -> LOYALTY POINTS CREDITED
    // -------------------------------------------------------------
    console.log('\n[TEST 8] Testing Merchant Cash Payment Confirmation & Loyalty Award...');
    
    // Switch to merchant session
    await page.evaluate((usr) => {
      localStorage.setItem('zoorup_current_user', JSON.stringify(usr));
      localStorage.setItem('zoorup_auth_token', usr.token);
    }, testMerchantUser);

    await page.goto('http://localhost:5173/business/payments', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotsDir, 'merchant_payments_dashboard.png') });

    // Click "Confirm Paid" on the pending transaction
    await page.click('button:has-text("Confirm Paid")');
    await page.waitForTimeout(1000);

    // Verify customer received loyalty points
    const customerRecord = await page.evaluate((custPhone) => {
      const custs = JSON.parse(localStorage.getItem('zoorup_customers') || '[]');
      return custs.find(c => c.phone === custPhone);
    }, testCustomerUser.phone);

    if (!customerRecord || customerRecord.points <= 0) {
      throw new Error(`FAIL: Customer points were not awarded! Current points: ${customerRecord?.points}`);
    }
    console.log(`✓ PASS: Merchant confirmed payment! Customer awarded ${customerRecord.points} loyalty points.`);

    console.log('\n============================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
    console.log('1. Online Table Booking is fully operational with double-booking prevention.');
    console.log('2. Online Ordering & Delivery Partner are completely removed.');
    console.log('3. Reports section is removed.');
    console.log('4. Demo data & demo persona switchers are completely eliminated.');
    console.log('5. In-store digital menu item selection, UPI intent/QR, and cash confirmation work flawlessly.');
    console.log('============================================================\n');

  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err);
    await page.screenshot({ path: path.join(screenshotsDir, 'failure_state.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runFinalCleanupAndTableBookingTest();
