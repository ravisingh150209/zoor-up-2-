import { chromium } from '@playwright/test';

async function diagnose() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));

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

  await page.goto('http://localhost:5173/login');
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

  console.log('Navigating to /business/table-booking...');
  await page.goto('http://localhost:5173/business/table-booking', { waitUntil: 'networkidle' });
  console.log('Current URL:', page.url());
  const body = await page.innerHTML('body');
  console.log('Body length:', body.length);
  console.log('Body snippet:', body.slice(0, 300));

  await browser.close();
}

diagnose();
