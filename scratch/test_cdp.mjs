import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const context = await browser.newContext({
    serviceWorkers: 'block'
  });
  const page = await context.newPage();

  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');

  client.on('Network.requestWillBeSent', params => {
    if (params.request.url.includes('api')) {
      console.log(`[CDP REQ] ${params.request.method} ${params.request.url}`);
      console.log(`[CDP REQ HEADERS]`, params.request.headers);
    }
  });

  client.on('Network.responseReceived', params => {
    if (params.response.url.includes('api')) {
      console.log(`[CDP RESP] ${params.response.status} ${params.response.url}`);
      console.log(`[CDP RESP HEADERS]`, params.response.headers);
    }
  });

  client.on('Network.loadingFailed', params => {
    if (params.type === 'Fetch' || params.type === 'XHR' || (params.requestId && String(params.errorText))) {
      console.log(`[CDP FAILED] type=${params.type} errorText=${params.errorText} canceled=${params.canceled} blockedReason=${params.blockedReason} corsErrorStatus=${JSON.stringify(params.corsErrorStatus)}`);
    }
  });

  const rand = Math.floor(Math.random() * 90000) + 10000;
  const email = `cdp_test_${rand}@zoorup-dash.com`;
  const password = 'Password123!';

  console.log(`Registering owner: ${email}...`);
  await fetch('https://zoor-up-2.onrender.com/api/auth/owner/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      name: `CDP Store ${rand}`,
      owner_name: `CDP Owner ${rand}`,
      email: email,
      phone: `98${rand}2234`,
      password: password
    })
  });

  console.log('Navigating to login...');
  await page.goto('https://zoor-up-9b3a3.web.app/login/business', { waitUntil: 'networkidle' });

  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(email);
  await passwordInput.fill(password);

  console.log('Submitting login...');
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  await page.waitForTimeout(10000);

  await browser.close();
}

run().catch(console.error);
