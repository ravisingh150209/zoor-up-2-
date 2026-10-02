import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

// Mock authenticated customer in localStorage
await page.goto('http://localhost:5173/');
await page.evaluate(() => {
  const mockUser = {
    id: 'cust_test_123',
    customer_id: 'ZUP-CUS-12345',
    email: 'customer@zoorup.test',
    name: 'Ravi Singh',
    role: 'customer'
  };
  localStorage.setItem('zoorup_auth_user', JSON.stringify(mockUser));
  localStorage.setItem('zoorup_user_role', 'customer');
});

console.log('Navigating to /customer/scanner...');
await page.goto('http://localhost:5173/customer/scanner', { waitUntil: 'networkidle' });

const content = await page.textContent('body');
console.log('Page content contains "Camera Permission Required":', content.includes('Camera Permission Required'));
console.log('Page content contains "Unable to access camera":', content.includes('Unable to access camera'));
console.log('Logs captured:', logs);

await browser.close();
