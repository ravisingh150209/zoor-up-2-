import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('http://localhost:5173/login');
console.log('Login URL:', page.url());

// Check App.jsx routes
await page.goto('http://localhost:5173/customer/scanner');
console.log('Current URL after /customer/scanner:', page.url());

await browser.close();
