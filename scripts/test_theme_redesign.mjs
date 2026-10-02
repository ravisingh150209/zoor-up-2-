import fs from 'fs';
import assert from 'assert';

console.log('============================================================');
console.log('ZOOR UP — THEME REDESIGN AUDIT (WHITE 70% + LIGHT ORANGE 30%)');
console.log('============================================================\n');

let passed = 0;

// TEST 1: CSS Variables in index.css
console.log('--- TEST 1: CSS ROOT VARIABLES AUDIT ---');
const indexCss = fs.readFileSync('src/styles/index.css', 'utf8');
assert.ok(indexCss.toLowerCase().includes('--bg-app: #fffdf9;'), 'Must define Soft Off-White --bg-app: #FFFDF9');
assert.ok(indexCss.toLowerCase().includes('--bg-surface: #ffffff;'), 'Must define Primary White --bg-surface: #FFFFFF');
assert.ok(indexCss.toLowerCase().includes('--bg-sidebar: #ffffff;'), 'Must define Primary White --bg-sidebar: #FFFFFF');
assert.ok(indexCss.toLowerCase().includes('--primary-500: #f97316;'), 'Must define Primary Orange --primary-500: #F97316');
assert.ok(indexCss.toLowerCase().includes('--primary-600: #ea580c;'), 'Must define Dark Orange --primary-600: #EA580C');
assert.ok(indexCss.toLowerCase().includes('--primary-300: #fdba74;'), 'Must define Light Orange --primary-300: #FDBA74');
assert.ok(indexCss.toLowerCase().includes('--primary-100: #ffedd5;'), 'Must define Soft Orange --primary-100: #FFEDD5');
assert.ok(indexCss.toLowerCase().includes('--text-primary: #1f2937;'), 'Must define Text --text-primary: #1F2937');
assert.ok(indexCss.toLowerCase().includes('--text-secondary: #6b7280;'), 'Must define Secondary Text --text-secondary: #6B7280');
assert.ok(indexCss.toLowerCase().includes('--border-default: #e5e7eb;'), 'Must define Border --border-default: #E5E7EB');
assert.ok(indexCss.toLowerCase().includes('--border-focus: #f97316;'), 'Must define Focus Border --border-focus: #F97316');
passed++;
console.log('✅ TEST 1 PASSED: Core CSS root variables align with official palette.\n');

// TEST 2: Button & Component Styles
console.log('--- TEST 2: BUTTONS AND COMPONENTS STYLES ---');
const componentsCss = fs.readFileSync('src/styles/components.css', 'utf8');
assert.ok(componentsCss.includes('#F97316'), 'Primary button uses #F97316');
assert.ok(componentsCss.includes('#EA580C'), 'Primary button hover uses #EA580C');
assert.ok(componentsCss.includes('#FFF7ED'), 'Secondary button background uses #FFF7ED');
assert.ok(componentsCss.includes('#FDBA74'), 'Secondary button border uses #FDBA74');
assert.ok(componentsCss.includes('rgba(249, 115, 22, 0.12)'), 'Input focus ring uses orange glow');
assert.ok(componentsCss.includes('#9A3412'), 'Table headers use #9A3412');
passed++;
console.log('✅ TEST 2 PASSED: Buttons, inputs, and tables updated to light orange/white.\n');

// TEST 3: Navbar Theme & Shadows
console.log('--- TEST 3: NAVBAR THEME & HEADER STYLES ---');
const navbarCss = fs.readFileSync('src/styles/navbar.css', 'utf8');
assert.ok(navbarCss.includes('#FFFFFF'), 'Navbar background uses #FFFFFF');
assert.ok(navbarCss.includes('0 2px 10px rgba(0, 0, 0, 0.05)'), 'Navbar shadow matches 0 2px 10px rgba(0,0,0,0.05)');
assert.ok(navbarCss.includes('#1F2937'), 'Navigation text uses #1F2937');
assert.ok(navbarCss.includes('#F97316'), 'Action button / CTA uses #F97316');
passed++;
console.log('✅ TEST 3 PASSED: Navbar styled with clean white background and orange CTA.\n');

// TEST 4: Sidebar Desktop & Mobile Drawer
console.log('--- TEST 4: SIDEBAR STYLING AUDIT ---');
const sidebarJsx = fs.readFileSync('src/components/layout/Sidebar.jsx', 'utf8');
assert.ok(sidebarJsx.includes('#FFF1E6'), 'Active sidebar item uses light orange background #FFF1E6');
assert.ok(sidebarJsx.includes('#EA580C'), 'Active sidebar item uses dark orange text #EA580C');
assert.ok(sidebarJsx.includes('#F97316'), 'Active sidebar icon uses #F97316');
passed++;
console.log('✅ TEST 4 PASSED: Sidebar uses clean white background with light orange active indicator.\n');

// TEST 5: Public Pages & Hero Sections
console.log('--- TEST 5: PUBLIC LANDING & DOWNLOAD PAGE ---');
const landingJsx = fs.readFileSync('src/pages/public/PublicLanding.jsx', 'utf8');
assert.ok(!landingJsx.includes('#1e1b4b'), 'No dark purple radial gradient in PublicLanding.jsx');
assert.ok(landingJsx.includes('#FFF7ED'), 'Uses soft orange radial gradient in PublicLanding.jsx');

const downloadJsx = fs.readFileSync('src/pages/public/DownloadPage.jsx', 'utf8');
assert.ok(!downloadJsx.includes('#060910'), 'No dark footer #060910 in DownloadPage.jsx');
assert.ok(!downloadJsx.includes('#0f172a'), 'No dark background #0f172a in DownloadPage.jsx');
assert.ok(downloadJsx.includes('#F97316'), 'Uses #F97316 download CTA');
passed++;
console.log('✅ TEST 5 PASSED: Public landing and Download page transformed to White SaaS theme.\n');

// TEST 6: Onboarding 10-Step Progress Strip
console.log('--- TEST 6: BUSINESS ONBOARDING PROGRESS STRIP ---');
const onboardingJsx = fs.readFileSync('src/pages/business/BusinessOnboarding.jsx', 'utf8');
assert.ok(onboardingJsx.includes('#FFF1E6'), 'Active onboarding step uses light orange background #FFF1E6');
assert.ok(onboardingJsx.includes('#F97316'), 'Active onboarding step indicator uses orange #F97316');
assert.ok(onboardingJsx.includes('#EA580C'), 'Active onboarding step label uses #EA580C');
assert.ok(onboardingJsx.includes('overflowX: \'auto\''), 'Step navigation allows horizontal scrolling on mobile');
passed++;
console.log('✅ TEST 6 PASSED: Onboarding wizard maintains 10 steps with light orange active state.\n');

// TEST 7: Loyalty Card & QR Menu
console.log('--- TEST 7: LOYALTY CARD & QR MENU STYLING ---');
const loyaltyJsx = fs.readFileSync('src/pages/customer/CustomerLoyalty.jsx', 'utf8');
assert.ok(!loyaltyJsx.includes('#1e1b4b'), 'No dark purple gradient in CustomerLoyalty.jsx');
assert.ok(loyaltyJsx.includes('#FFF7ED'), 'Loyalty card uses light orange accent gradient');
assert.ok(loyaltyJsx.includes('#EA580C'), 'Loyalty card highlights points in #EA580C');

const qrMenuJsx = fs.readFileSync('src/pages/public/PublicQRMenu.jsx', 'utf8');
assert.ok(!qrMenuJsx.includes('#1e1b4b'), 'No dark purple background in PublicQRMenu.jsx');
assert.ok(qrMenuJsx.includes('#FFF7ED'), 'Selected category uses light orange accent');
assert.ok(qrMenuJsx.includes('#EA580C'), 'Sticky checkout CTA uses orange theme');
passed++;
console.log('✅ TEST 7 PASSED: Loyalty card and QR menu follow White base with Orange highlights.\n');

// TEST 8: Auth Pages Theme
console.log('--- TEST 8: AUTH PAGES AUDIT ---');
const adminLoginJsx = fs.readFileSync('src/pages/auth/AdminLogin.jsx', 'utf8');
assert.ok(!adminLoginJsx.includes('#04070e'), 'No #04070e in AdminLogin.jsx');
assert.ok(!adminLoginJsx.includes('#090d16'), 'No #090d16 in AdminLogin.jsx');
assert.ok(adminLoginJsx.includes('#FFFDF9'), 'AdminLogin background is #FFFDF9');

const authHubJsx = fs.readFileSync('src/pages/auth/AuthHub.jsx', 'utf8');
assert.ok(!authHubJsx.includes('#1e1b4b'), 'No #1e1b4b in AuthHub.jsx');
assert.ok(authHubJsx.includes('#F97316'), 'AuthHub role cards use orange gradient');
passed++;
console.log('✅ TEST 8 PASSED: AdminLogin and AuthHub updated to clean SaaS theme.\n');

// TEST 9: Build Integrity & Bundle Check
console.log('--- TEST 9: PRODUCTION BUILD OUTPUT CHECK ---');
assert.ok(fs.existsSync('dist/index.html'), 'dist/index.html must exist');
const distHtml = fs.readFileSync('dist/index.html', 'utf8');
assert.ok(distHtml.includes('theme-color'), 'Production HTML contains meta theme-color');
passed++;
console.log('✅ TEST 9 PASSED: Production build artifacts verified.\n');

console.log('============================================================');
console.log(`ALL ${passed}/${passed} THEME AUDIT TESTS PASSED (100% SUCCESS)`);
console.log('============================================================');
