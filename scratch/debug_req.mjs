import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  
  page.on('response', async resp => {
    if (resp.url().includes('loyalty') || resp.url().includes('rewards') || resp.url().includes('home')) {
      console.log('\n--- RESPONSE ---');
      console.log('URL:', resp.url());
      console.log('STATUS:', resp.status());
      console.log('REQ HEADERS:', JSON.stringify(resp.request().headers(), null, 2));
      try {
        console.log('BODY:', await resp.text());
      } catch (e) {
        console.log('BODY ERROR:', e.message);
      }
    }
  });

  await page.goto('https://zoor-up-9b3a3.web.app/login/customer', { waitUntil: 'networkidle' });
  await page.locator('input[placeholder*="email" i], input[type="email"], input[type="text"]').first().fill('loyalty_vip_test@zoorup.com');
  await page.locator('input[type="password"]').first().fill('Password123!');
  const loginRespPromise = page.waitForResponse(r => r.url().includes('customer/login') || r.url().includes('login'), { timeout: 10000 });
  await page.locator('button[type="submit"]').first().click();
  await loginRespPromise;
  await page.waitForTimeout(4000);

  await page.goto('https://zoor-up-9b3a3.web.app/customer/loyalty', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  await browser.close();
}

main().catch(console.error);
