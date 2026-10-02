import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));

await page.goto('http://localhost:5173/customer/scanner', { waitUntil: 'networkidle' });
const html = await page.innerHTML('body');
console.log('HTML length:', html.length);
console.log('HTML snippet:', html.substring(0, 1000));

await browser.close();
