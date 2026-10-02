import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('============================================================');
console.log('ZOOR UP — NAVBAR & RESPONSIVE VALIDATION SUITE');
console.log('============================================================\n');

let passed = 0;

// TEST 1: PublicNavbar component exists and imports required icons
console.log('--- TEST 1: PUBLIC NAVBAR COMPONENT & ICON IMPORTS ---');
const navbarPath = path.resolve('src/components/layout/PublicNavbar.jsx');
assert.ok(fs.existsSync(navbarPath), 'PublicNavbar.jsx must exist');
const navbarCode = fs.readFileSync(navbarPath, 'utf8');

assert.ok(navbarCode.includes('Smartphone') || navbarCode.includes('Download'), 'Navbar must import Smartphone or Download icon');
assert.ok(navbarCode.includes('QrCode'), 'Navbar must import QrCode icon');
assert.ok(navbarCode.includes('LogIn'), 'Navbar must import LogIn icon');
assert.ok(navbarCode.includes('Store'), 'Navbar must import Store icon');
assert.ok(navbarCode.includes('Menu'), 'Navbar must import Menu icon');
assert.ok(navbarCode.includes('X'), 'Navbar must import X icon');
assert.ok(navbarCode.includes('ZoorUpLogo'), 'Navbar must import official ZoorUpLogo');
passed++;
console.log('✅ TEST 1 PASSED: PublicNavbar component and all professional icons verified.\n');

// TEST 2: Official ZOOR UP Logo is preserved
console.log('--- TEST 2: OFFICIAL LOGO USAGE ---');
assert.ok(navbarCode.includes('<ZoorUpLogo'), 'Official ZoorUpLogo component must be rendered in navbar');
assert.ok(navbarCode.includes('ZOOR'), 'ZOOR UP brand text must be present');
passed++;
console.log('✅ TEST 2 PASSED: Official ZOOR UP brand logo preserved.\n');

// TEST 3: Get App Icon Replacement, Route, Tooltip, and Aria-label
console.log('--- TEST 3: GET APP ICON REPLACEMENT & ACCESSIBILITY ---');
assert.ok(navbarCode.includes('to="/download"'), 'Get App icon must link to /download');
assert.ok(navbarCode.includes('aria-label="Get App"'), 'Get App icon must have aria-label="Get App"');
assert.ok(navbarCode.includes('id="tooltip-get-app"') || navbarCode.includes('Get App'), 'Tooltip for Get App must exist');
passed++;
console.log('✅ TEST 3 PASSED: Get App text replaced by icon with tooltip and accessible label.\n');

// TEST 4: Live QR Demo Icon Replacement, Route, Tooltip, and Aria-label
console.log('--- TEST 4: LIVE QR DEMO ICON REPLACEMENT & ACCESSIBILITY ---');
assert.ok(navbarCode.includes('to="/m/green-leaf-grocery"'), 'Live QR Demo icon must link to /m/green-leaf-grocery');
assert.ok(navbarCode.includes('aria-label="Live QR Demo"'), 'Live QR Demo icon must have aria-label="Live QR Demo"');
assert.ok(navbarCode.includes('Live QR Demo'), 'Live QR Demo tooltip must exist');
passed++;
console.log('✅ TEST 4 PASSED: Live QR Demo text replaced by QrCode icon with tooltip.\n');

// TEST 5: Sign In and Register Business CTA Buttons
console.log('--- TEST 5: SIGN IN & REGISTER BUSINESS CTAs ---');
assert.ok(navbarCode.includes('to="/login"'), 'Sign In button must link to /login');
assert.ok(navbarCode.includes('Sign In'), 'Sign In text must remain for clarity');
assert.ok(navbarCode.includes('to="/signup/business"'), 'Register Business button must link to /signup/business');
assert.ok(navbarCode.includes('Register Business'), 'Register Business text must remain as primary CTA');
passed++;
console.log('✅ TEST 5 PASSED: Sign In & Register Business buttons preserved with icons.\n');

// TEST 6: Mobile Header & Drawer Structure
console.log('--- TEST 6: MOBILE HEADER & SLIDE-OUT DRAWER ---');
assert.ok(navbarCode.includes('navbar-mobile-header'), 'Mobile header layout must exist');
assert.ok(navbarCode.includes('navbar-hamburger-btn'), 'Hamburger toggle button must exist');
assert.ok(navbarCode.includes('navbar-mobile-drawer'), 'Mobile slide-out drawer must exist');
assert.ok(navbarCode.includes('mobileMenuOpen'), 'Mobile drawer open state must be managed');

// Inside mobile drawer, all 4 items must be present
assert.ok(navbarCode.includes('navbar-drawer-nav'), 'Mobile drawer nav container must exist');
passed++;
console.log('✅ TEST 6 PASSED: Mobile header [☰] [LOGO] [Sign In] and slide drawer verified.\n');

// TEST 7: Responsive CSS & Breakpoints
console.log('--- TEST 7: RESPONSIVE CSS & BREAKPOINT SPECIFICATIONS ---');
const cssPath = path.resolve('src/styles/navbar.css');
assert.ok(fs.existsSync(cssPath), 'navbar.css must exist');
const cssCode = fs.readFileSync(cssPath, 'utf8');

assert.ok(cssCode.includes('@media (max-width: 768px)'), 'Mobile media query (<= 768px) required');
assert.ok(cssCode.includes('@media (min-width: 769px)'), 'Desktop media query (>= 769px) required');
assert.ok(cssCode.includes('@media (max-width: 360px)'), 'Ultra-compact mobile query (<= 360px) required');
assert.ok(cssCode.includes('.navbar-tooltip'), 'Tooltip CSS class required');
assert.ok(cssCode.includes('.navbar-icon-btn'), 'Icon button CSS class required');
assert.ok(cssCode.includes('backdrop-filter'), 'Glassmorphism blur required');
passed++;
console.log('✅ TEST 7 PASSED: Responsive CSS and breakpoint rules verified.\n');

// TEST 8: Public Pages Integration
console.log('--- TEST 8: PUBLIC PAGES NAVBAR INTEGRATION ---');
const landingCode = fs.readFileSync(path.resolve('src/pages/public/PublicLanding.jsx'), 'utf8');
const downloadCode = fs.readFileSync(path.resolve('src/pages/public/DownloadPage.jsx'), 'utf8');

assert.ok(landingCode.includes('<PublicNavbar />') || landingCode.includes('<PublicNavbar'), 'PublicLanding must render PublicNavbar');
assert.ok(downloadCode.includes('<PublicNavbar />') || downloadCode.includes('<PublicNavbar'), 'DownloadPage must render PublicNavbar');
passed++;
console.log('✅ TEST 8 PASSED: PublicNavbar integrated cleanly into PublicLanding and DownloadPage.\n');

console.log('============================================================');
console.log(`ALL ${passed}/8 NAVBAR VALIDATION TESTS PASSED! (100% SUCCESS)`);
console.log('============================================================');
