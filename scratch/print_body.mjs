import { chromium } from 'playwright';

const LIVE_FE = 'https://zoor-up-9b3a3.web.app';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzZlNjAyMTIzNjRlMSIsInJvbGUiOiJDVVNUT01FUiIsImN1c3RvbWVyX2lkIjoiY3VzX2M4N2YzOTc1MWFkMiIsImV4cCI6MTc5MTYxOTcxN30.hEEyu3BqtJZeKWKD5MIgqtdQ-KY2ZGqGk5nYvgU5qlA';
const AUTH_USER = {
  id: 'user_6e60212364e1',
  email: 'loyalty_vip_test@zoorup.com',
  role: 'CUSTOMER',
  customer_id: 'cus_c87f39751ad2',
  name: 'VIP Loyalty Customer'
};

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  await page.goto(LIVE_FE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('zoorup_token', token);
    localStorage.setItem('zoorup_auth_token', token);
    localStorage.setItem('token', token);
    localStorage.setItem('zoorup_user', JSON.stringify(user));
    localStorage.setItem('zoorup_current_user', JSON.stringify(user));
    localStorage.setItem('user', JSON.stringify(user));
  }, { token: AUTH_TOKEN, user: AUTH_USER });

  await page.goto(`${LIVE_FE}/customer/loyalty`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  const text = await page.innerText('body');
  console.log('=== PAGE INNER TEXT ===\n', text);
  await browser.close();
}

main().catch(console.error);
