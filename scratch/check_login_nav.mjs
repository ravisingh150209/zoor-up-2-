import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  page.on('console', m => console.log('[PAGE CONSOLE]', m.type(), m.text()));
  page.on('response', r => {
    if (r.status() >= 400) console.log('[PAGE NET]', r.status(), r.url());
  });

  await page.goto('https://zoor-up-9b3a3.web.app/login/business', { waitUntil: 'networkidle' });
  await page.locator('input[placeholder*="email" i]').fill('bizowner_47473@zoorup-dash.com');
  await page.locator('input[type="password"]').fill('Password123!');
  
  const loginRespPromise = page.waitForResponse(r => r.url().includes('login'), { timeout: 10000 });
  await page.locator('button[type="submit"]').click();
  const loginResp = await loginRespPromise;
  console.log('Login API status:', loginResp.status());
  const loginJson = await loginResp.json();
  console.log('Login user name:', loginJson.user?.name);
  console.log('Login user onboarding_completed:', loginJson.user?.onboarding_completed);

  await page.waitForTimeout(4000);
  console.log('Current URL after login:', page.url());

  await page.goto('https://zoor-up-9b3a3.web.app/business/offers', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('Current URL after navigating to offers:', page.url());
  const bodyText = await page.innerText('body');
  console.log('Body snippet:\n', bodyText.substring(0, 400));

  await browser.close();
}

main().catch(console.error);
