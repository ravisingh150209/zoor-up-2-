import { chromium, devices } from 'playwright';

async function testDevice(deviceName, isIncognito = false) {
  console.log(`\n======================================================`);
  console.log(`TESTING DEVICE: ${deviceName} (${isIncognito ? 'INCOGNITO' : 'NORMAL'})`);
  console.log(`======================================================`);

  const device = devices[deviceName] || devices['Pixel 7'];
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  
  const context = await browser.newContext({
    ...device
  });
  const page = await context.newPage();

  const failedRequests = [];
  const apiRequests = [];

  page.on('response', resp => {
    if (resp.url().includes('api')) {
      apiRequests.push(`${resp.status()} ${resp.request().method()} ${resp.url()}`);
    }
  });

  page.on('requestfailed', req => {
    if (req.url().includes('api')) {
      failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('error') || msg.text().includes('fetch')) {
      console.log(`  [CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  // 1. Homepage
  console.log('1. Opening Homepage...');
  await page.goto('https://zoor-up-9b3a3.web.app/', { waitUntil: 'networkidle' });
  const homeTitle = await page.title();
  console.log('   Homepage Title:', homeTitle);

  // 2. Business Login
  console.log('2. Opening Business Login...');
  await page.goto('https://zoor-up-9b3a3.web.app/login/business', { waitUntil: 'networkidle' });

  console.log('3. Logging in as Business...');
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i], input[type="text"]').first();
  await emailInput.fill('bizowner_47473@zoorup-dash.com');
  await page.locator('input[type="password"]').fill('Password123!');
  await page.locator('button[type="submit"]').click();

  // 4. Business Dashboard Verification
  console.log('4. Waiting for Dashboard to load...');
  await page.waitForSelector('.stat-card, .stat-value', { timeout: 20000 });
  await page.waitForTimeout(2000);

  const dashUrl = page.url();
  console.log('   Dashboard URL:', dashUrl);

  const dashText = await page.innerText('body');
  const hasDashError = dashText.includes('Unable to load business dashboard') || dashText.includes('Failed to fetch');
  const hasStats = dashText.includes("Today's Sales") || dashText.includes("TODAY'S SALES");
  const hasStore = dashText.includes('Dash Store 47473');

  console.log('   Has Error:', hasDashError);
  console.log('   Has Stats rendered:', hasStats);
  console.log('   Has Store name rendered:', hasStore);

  // 5. Customer Login
  console.log('5. Opening Customer Login...');
  await page.goto('https://zoor-up-9b3a3.web.app/login/customer', { waitUntil: 'networkidle' });
  const custTitle = await page.title();
  console.log('   Customer Login Title:', custTitle);

  // Check API calls
  console.log('\n--- API Calls Recorded on Mobile ---');
  for (const call of apiRequests) {
    console.log('  ', call);
  }

  console.log('\n--- Failed API Calls on Mobile ---');
  console.log('   Count:', failedRequests.length);
  for (const fail of failedRequests) {
    console.log('  ', fail);
  }

  await browser.close();

  if (hasDashError || !hasStats || failedRequests.length > 0) {
    throw new Error(`Device ${deviceName} verification FAILED.`);
  }

  console.log(`>>> DEVICE ${deviceName} PASSED ALL TESTS <<<\n`);
}

async function run() {
  await testDevice('Pixel 7', false);
  await testDevice('iPhone 14', false);
  await testDevice('Pixel 7', true); // Incognito
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
