import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROD_URL = 'https://zoor-up-9b3a3.web.app';
const TEST_EMAIL = 'upload_live_v2@zoorup.com';
const TEST_PASS = 'Password123!';

const LOGO_FILE = path.resolve(__dirname, 'real_test_logo.png');
const PRODUCT_FILE = path.resolve(__dirname, 'real_test_product.png');

async function run() {
  console.log('=== STARTING LIVE E2E PRODUCTION IMAGE UPLOAD TESTS ===');
  console.log(`Target: ${PROD_URL}`);
  console.log(`Logo file: ${LOGO_FILE} (exists: ${fs.existsSync(LOGO_FILE)})`);
  console.log(`Product file: ${PRODUCT_FILE} (exists: ${fs.existsSync(PRODUCT_FILE)})`);

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const context = await browser.newContext({
    serviceWorkers: 'block', // bypass SW cache for fresh network loads
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[UPLOAD]') || text.includes('error') || text.includes('Error')) {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${text}`);
    }
  });

  page.on('response', async res => {
    if (res.status() >= 400) {
      const body = await res.text().catch(() => '');
      console.log(`[NET ERROR ${res.status()}] ${res.request().method()} ${res.url()} -> ${body.substring(0, 150)}`);
    }
  });

  try {
    // 1. Login as Business Owner
    console.log('\n--- STEP 1: Logging in as business owner ---');
    await page.goto(`${PROD_URL}/login/business`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    const inputs = await page.$$('input');
    await inputs[0].fill(TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASS);
    const loginRespPromise = page.waitForResponse(r => r.url().includes('login'), { timeout: 15000 });
    await page.locator('button[type="submit"]').click();
    const loginResp = await loginRespPromise;
    console.log(`Login API status: ${loginResp.status()}`);
    await page.waitForTimeout(3000);
    console.log(`Current URL after login: ${page.url()}`);

    // 2. Test Business Logo Upload on /business/profile
    console.log('\n--- STEP 2: Testing Business Logo Upload on /business/profile ---');
    await page.goto(`${PROD_URL}/business/profile`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 15000 });

    // Find all file inputs on profile page (cover banner is 0 & 1, logo is 2 & 3)
    const fileInputs = await page.$$('input[type="file"]');
    console.log(`Found ${fileInputs.length} file inputs on profile page`);

    let logoInput = fileInputs[2] || fileInputs[0];
    console.log('Uploading real logo image...');
    await logoInput.setInputFiles(LOGO_FILE);

    // Wait for upload network request to finish and preview to update
    await page.waitForTimeout(5000);

    // Check preview image src in the logo container
    const images = await page.$$eval('img', imgs => imgs.map(i => i.src));
    const uploadedLogoUrl = images.find(src => src.includes('supabase.co') && src.includes('business-logos'));
    console.log('Uploaded Logo URL in DOM:', uploadedLogoUrl);

    if (!uploadedLogoUrl) {
      throw new Error(`Logo preview does not have a Supabase Storage URL! Found images: ${JSON.stringify(images)}`);
    }

    // Ensure all required fields have values to satisfy browser HTML5 validation
    const allInputs = await page.$$('input:not([type="file"]):not([type="hidden"])');
    for (const inp of allInputs) {
      const type = (await inp.getAttribute('type')) || 'text';
      const val = await inp.inputValue().catch(() => '');
      if (!val) {
        if (type === 'email') await inp.fill('contact@store.com').catch(() => {});
        else if (type === 'tel' || type === 'number') await inp.fill('9899990001').catch(() => {});
        else await inp.fill('Commercial Hub').catch(() => {});
      }
    }

    // Check if any form element is invalid
    const invalidInputs = await page.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return ['no form found'];
      const invalids = [];
      for (const el of form.elements) {
        if (el.checkValidity && !el.checkValidity()) {
          invalids.push({ id: el.id, validationMessage: el.validationMessage });
        }
      }
      return invalids;
    });
    console.log('Invalid form elements before save:', invalidInputs);

    // Click "Save Changes" on profile
    console.log('Saving Business Profile changes...');
    const savePromise = page.waitForResponse(
      res => res.url().includes('/api/business/profile') && res.request().method() === 'PUT',
      { timeout: 15000 }
    ).catch(e => ({ status: () => `Timeout/Error: ${e.message}` }));

    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit();
    });
    const saveRes = await savePromise;
    console.log(`Save Profile Changes PUT response status: ${saveRes.status()}`);
    await page.waitForTimeout(2000);

    // STEP D: Refresh Page and verify logo persistence
    console.log('\n--- STEP 3: Refreshing page to verify Business Logo persistence ---');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('img[src*="business-logos"]', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const reloadedImages = await page.$$eval('img', imgs => imgs.map(i => i.src));
    console.log('All image sources after reload:', reloadedImages);
    const persistedLogoUrl = reloadedImages.find(src => src.includes('supabase.co') && src.includes('business-logos'));
    console.log('Persisted Logo URL after reload:', persistedLogoUrl);

    if (!persistedLogoUrl) {
      throw new Error('Logo did not persist after page refresh!');
    }
    console.log('>>> BUSINESS LOGO UPLOAD & PERSISTENCE: PASS');

    // STEP B: Product Image Upload on /business/products
    console.log('\n--- STEP 4: Testing Product Image Upload on /business/products ---');
    await page.goto(`${PROD_URL}/business/products`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Look for "Add New Item" button
    const addProductBtn = await page.getByRole('button', { name: /Add New Item|Add Product|New Item/i }).first();
    if (!addProductBtn) {
      throw new Error('Add Item button not found on /business/products');
    }
    await addProductBtn.click();
    await page.waitForTimeout(1500);

    // Fill in product details
    const uniqueTitle = `Mocha Special ${Date.now() % 10000}`;
    await page.fill('input[placeholder*="Gir Cow Ghee" i], input[placeholder*="Espresso" i]', uniqueTitle);
    await page.fill('input[placeholder*="Bakery" i]', 'Beverages & Coffee');
    await page.fill('input[type="number"]', '180');

    // Find file input in the product modal
    const productFileInputs = await page.$$('input[type="file"]');
    console.log(`Found ${productFileInputs.length} file inputs in product modal`);
    const prodInput = productFileInputs[productFileInputs.length - 2] || productFileInputs[productFileInputs.length - 1];

    console.log('Uploading real product image...');
    await prodInput.setInputFiles(PRODUCT_FILE);
    await page.waitForTimeout(5000);

    const modalImages = await page.$$eval('img', imgs => imgs.map(i => i.src));
    const uploadedProdUrl = modalImages.find(src => src.includes('supabase.co') && src.includes('product-images'));
    console.log('Uploaded Product Image URL in DOM:', uploadedProdUrl);

    if (!uploadedProdUrl) {
      throw new Error(`Product image preview not found! Found images: ${JSON.stringify(modalImages)}`);
    }

    // Save product
    console.log('Saving new product...');
    const prodSavePromise = page.waitForResponse(
      res => res.url().includes('/products') && res.request().method() === 'POST',
      { timeout: 15000 }
    ).catch(e => ({ status: () => `Timeout/Error: ${e.message}` }));

    const saveProdBtn = await page.getByRole('button', { name: /Add to Catalog|Save Changes|Save/i }).first();
    await saveProdBtn.click();
    const prodSaveRes = await prodSavePromise;
    console.log(`Create Product POST response status: ${prodSaveRes.status()}`);
    await page.waitForTimeout(3000);

    // Refresh products page
    console.log('Refreshing products page...');
    await page.goto(`${PROD_URL}/business/products`, { waitUntil: 'networkidle' });
    await page.waitForSelector('img[src*="product-images"]', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const productPageImages = await page.$$eval('img', imgs => imgs.map(i => i.src));
    console.log('Product page images after reload:', productPageImages);
    const persistedProdUrl = productPageImages.find(src => src.includes('supabase.co') && src.includes('product-images'));
    console.log('Persisted Product Image URL in product list:', persistedProdUrl);

    if (!persistedProdUrl) {
      throw new Error('Uploaded product image did not appear in products list after refresh!');
    }
    console.log('>>> PRODUCT IMAGE UPLOAD & PERSISTENCE: PASS');

    // STEP E: Logout / Login
    console.log('\n--- STEP 5: Testing Logout and Re-login ---');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(`${PROD_URL}/login/business`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    const reInputs = await page.$$('input');
    await reInputs[0].fill(TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASS);
    const reLoginRespPromise = page.waitForResponse(r => r.url().includes('login'), { timeout: 15000 });
    await page.locator('button[type="submit"]').click();
    const reLoginResp = await reLoginRespPromise;
    console.log(`Re-login API status: ${reLoginResp.status()}`);
    await page.waitForURL(url => url.pathname.includes('/business'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.goto(`${PROD_URL}/business/profile`, { waitUntil: 'networkidle' });
    await page.waitForSelector('img[src*="business-logos"]', { timeout: 15000 });
    const postLoginImages = await page.$$eval('img', imgs => imgs.map(i => i.src));
    console.log('Post login images in DOM:', postLoginImages);
    const postLoginLogo = postLoginImages.find(src => src.includes('supabase.co') && src.includes('business-logos'));
    console.log('Logo URL after logout and fresh login:', postLoginLogo);
    if (!postLoginLogo) {
      throw new Error('Logo not visible after logout and login!');
    }
    console.log('>>> LOGOUT & RE-LOGIN PERSISTENCE: PASS');

    // STEP F & G: Open from another device / independent session
    console.log('\n--- STEP 6: Testing from another device/browser context ---');
    const deviceContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      viewport: { width: 390, height: 844 },
      isMobile: true
    });
    const devicePage = await deviceContext.newPage();

    const activeLogoToFetch = postLoginLogo || persistedLogoUrl;
    console.log(`Device direct fetch logo (${activeLogoToFetch}):`);
    const logoFetchRes = await devicePage.request.get(activeLogoToFetch);
    console.log(`Device direct fetch logo status: HTTP ${logoFetchRes.status()}`);

    console.log(`Device direct fetch product (${persistedProdUrl}):`);
    const prodFetchRes = await devicePage.request.get(persistedProdUrl);
    console.log(`Device direct fetch product status: HTTP ${prodFetchRes.status()}`);

    if (logoFetchRes.status() !== 200 || prodFetchRes.status() !== 200) {
      throw new Error(`Images failed to load on second device! Logo: ${logoFetchRes.status()}, Product: ${prodFetchRes.status()}`);
    }

    // Now visit public QR / store menu
    await devicePage.goto(`${PROD_URL}/store/offers-store-69700`, { waitUntil: 'networkidle' }).catch(() => {});
    await devicePage.waitForTimeout(3000);
    const deviceImages = await devicePage.$$eval('img', imgs => imgs.map(i => i.src));
    console.log('Public Storefront Images loaded on mobile device:', deviceImages.filter(s => s.includes('supabase.co')));
    console.log('>>> SECOND DEVICE ACCESS & CDN DELIVERY: PASS');

    console.log('\n=== ALL E2E BROWSER IMAGE UPLOAD TESTS PASSED SUCCESSFULLY! ===');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('\n!!! E2E TEST FAILED:', err);
    await browser.close();
    process.exit(1);
  }
}

run();
