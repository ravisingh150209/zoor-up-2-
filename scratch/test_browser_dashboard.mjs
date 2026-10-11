import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const networkLogs = [];
  page.on('request', req => {
    if (req.url().includes('api')) {
      console.log(`>> REQ ${req.method()} ${req.url()}`, req.headers());
    }
  });
  page.on('response', resp => {
    if (resp.url().includes('api')) {
      console.log(`<< RESP ${resp.status()} ${resp.url()}`);
    }
  });
  page.on('requestfailed', req => {
    if (req.url().includes('api')) {
      console.log(`XX FAILED ${req.method()} ${req.url()} - ${req.failure()?.errorText}`, req.headers());
    }
  });
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  const rand = Math.floor(Math.random() * 90000) + 10000;
  const email = `bizowner_${rand}@zoorup-dash.com`;
  const password = 'Password123!';

  console.log(`Registering new owner: ${email}...`);
  const regRes = await fetch('https://zoor-up-2.onrender.com/api/auth/owner/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      name: `Dash Store ${rand}`,
      owner_name: `Dash Owner ${rand}`,
      email: email,
      phone: `98${rand}1234`,
      password: password
    })
  });
  console.log('Registration status:', regRes.status);

  console.log('Navigating to login...');
  await page.goto('https://zoor-up-9b3a3.web.app/login/business', { waitUntil: 'networkidle' });

  console.log('Current URL:', page.url());

  // Fill in login credentials
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(email);
  await passwordInput.fill(password);

  console.log('Submitting login...');
  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  // Wait for requests to resolve
  console.log('Waiting for requests to resolve...');
  await page.waitForTimeout(15000);
  console.log('URL after wait:', page.url());

  // Check what is on the page
  const text = await page.innerText('body');
  console.log('\n--- Page Text Snippet ---');
  console.log(text.slice(0, 1000));
  console.log('-------------------------\n');

  console.log('\n--- Network Logs ---');
  for (const log of networkLogs) {
    if (log.includes('api') || log.includes('FAILED')) {
      console.log(log);
    }
  }
  console.log('--------------------\n');

  await browser.close();
}

run().catch(console.error);
