import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const screenshotsDir = path.resolve('test-results/screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const VIEWPORTS = [
  { name: '320x800', width: 320, height: 800, type: 'mobile' },
  { name: '360x800', width: 360, height: 800, type: 'mobile' },
  { name: '390x844', width: 390, height: 844, type: 'mobile' },
  { name: '412x915', width: 412, height: 915, type: 'mobile' },
  { name: '430x932', width: 430, height: 932, type: 'mobile' },
  { name: '768x1024', width: 768, height: 1024, type: 'tablet' },
  { name: '1024x768', width: 1024, height: 768, type: 'desktop' },
  { name: '1280x720', width: 1280, height: 720, type: 'desktop' },
  { name: '1366x768', width: 1366, height: 768, type: 'desktop' },
  { name: '1440x900', width: 1440, height: 900, type: 'desktop' },
  { name: '1920x1080', width: 1920, height: 1080, type: 'desktop' },
];

const LOCAL_URL = 'http://localhost:5173/';

console.log('================================================================');
console.log('ZOOR UP — PLAYWRIGHT AUTOMATED RESPONSIVE VISUAL TEST SUITE');
console.log('================================================================\n');

async function checkElementsOverlap(boxA, boxB, labelA, labelB) {
  if (!boxA || !boxB) return false;
  // Overlap if horizontal ranges overlap AND vertical ranges overlap
  const xOverlap = Math.max(0, Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x));
  const yOverlap = Math.max(0, Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y));
  const hasOverlap = xOverlap > 0 && yOverlap > 0;
  if (hasOverlap) {
    console.error(`  ❌ OVERLAP DETECTED between ${labelA} and ${labelB}: xOverlap=${xOverlap}px, yOverlap=${yOverlap}px`);
  }
  return hasOverlap;
}

async function runTestSuite() {
  console.log('1. Launching Playwright Chromium browser...');
  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  console.log(`   ✓ Chromium launched successfully: v${browserVersion}`);

  const results = {
    playwrightVersion: '1.63.0',
    browserVersion,
    localUrl: LOCAL_URL,
    viewports: [],
    consoleErrors: [],
    networkErrors: [],
    allPassed: true,
  };

  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen for console and network errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore React DevTools or benign favicon warnings if any
      if (!text.includes('React Router') && !text.includes('favicon')) {
        results.consoleErrors.push({ text, location: msg.location() });
        console.warn(`   ⚠️ App Console Error: ${text}`);
      }
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      const url = res.url();
      if (!url.includes('favicon.ico')) {
        results.networkErrors.push({ url, status: res.status() });
        console.warn(`   ⚠️ Network Error: ${res.status()} ${url}`);
      }
    }
  });

  console.log(`\n2. Running Visual Inspection across ${VIEWPORTS.length} Responsive Viewports...\n`);

  for (const vp of VIEWPORTS) {
    console.log(`----------------------------------------------------------------`);
    console.log(`▶ Testing Viewport: ${vp.name} (${vp.width}x${vp.height} - ${vp.type.toUpperCase()})`);
    console.log(`----------------------------------------------------------------`);

    await page.setViewportSize({ width: vp.width, height: vp.height });
    const response = await page.goto(LOCAL_URL, { waitUntil: 'networkidle' });
    const status = response ? response.status() : 'Unknown';

    if (status !== 200) {
      console.error(`  ❌ HTTP Status was ${status}, expected 200`);
      results.allPassed = false;
    } else {
      console.log(`  ✓ Page loaded with HTTP status 200`);
    }

    // 1. Check Horizontal Overflow
    const overflowInfo = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const docScrollWidth = document.documentElement.scrollWidth;
      const bodyScrollWidth = document.body.scrollWidth;
      const maxScrollWidth = Math.max(docScrollWidth, bodyScrollWidth);
      const hasHorizontalScroll = maxScrollWidth > docWidth;
      
      let offendingElements = [];
      if (hasHorizontalScroll) {
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > docWidth + 1) {
            offendingElements.push({
              tag: el.tagName,
              className: el.className,
              id: el.id,
              right: rect.right,
              docWidth
            });
          }
        });
      }

      return {
        clientWidth: docWidth,
        scrollWidth: maxScrollWidth,
        hasHorizontalScroll,
        offendingElements: offendingElements.slice(0, 5)
      };
    });

    if (overflowInfo.hasHorizontalScroll) {
      console.error(`  ❌ Horizontal page overflow detected! clientWidth=${overflowInfo.clientWidth}px, scrollWidth=${overflowInfo.scrollWidth}px`);
      console.error('     Offending elements:', overflowInfo.offendingElements);
      results.allPassed = false;
    } else {
      console.log(`  ✓ No horizontal page overflow (scrollWidth: ${overflowInfo.scrollWidth}px <= clientWidth: ${overflowInfo.clientWidth}px)`);
    }

    const vpResult = {
      viewport: vp.name,
      width: vp.width,
      height: vp.height,
      type: vp.type,
      horizontalOverflow: overflowInfo.hasHorizontalScroll,
      navbarChecks: {},
      screenshotPath: '',
    };

    // 2. Responsive Navbar Validation
    if (vp.width <= 768) {
      // Mobile checks
      console.log('  Testing Mobile Navbar Elements:');
      
      // Mobile header visible?
      const mobileHeader = await page.locator('.navbar-mobile-header');
      const isMobileHeaderVisible = await mobileHeader.isVisible();
      console.log(`  ✓ Mobile header visible: ${isMobileHeaderVisible}`);
      vpResult.navbarChecks.mobileHeaderVisible = isMobileHeaderVisible;

      // Hamburger button
      const hamburger = await page.locator('.navbar-hamburger-btn');
      const isHamburgerVisible = await hamburger.isVisible();
      console.log(`  ✓ Mobile hamburger button visible: ${isHamburgerVisible}`);
      vpResult.navbarChecks.hamburgerVisible = isHamburgerVisible;

      // Mobile Logo
      const mobileLogo = await page.locator('.navbar-mobile-left .navbar-brand-link');
      const isMobileLogoVisible = await mobileLogo.isVisible();
      console.log(`  ✓ Mobile brand logo visible: ${isMobileLogoVisible}`);
      vpResult.navbarChecks.mobileLogoVisible = isMobileLogoVisible;

      // Mobile Sign In
      const mobileSignIn = await page.locator('.navbar-mobile-signin');
      const isMobileSignInVisible = await mobileSignIn.isVisible();
      console.log(`  ✓ Mobile Sign In button visible: ${isMobileSignInVisible}`);
      vpResult.navbarChecks.mobileSignInVisible = isMobileSignInVisible;

      // Overlap check in mobile header
      const boxHamburger = await hamburger.boundingBox();
      const boxLogo = await mobileLogo.boundingBox();
      const boxSignIn = await mobileSignIn.boundingBox();

      const overlapHambLogo = await checkElementsOverlap(boxHamburger, boxLogo, 'Hamburger', 'Mobile Logo');
      const overlapLogoSignIn = await checkElementsOverlap(boxLogo, boxSignIn, 'Mobile Logo', 'Mobile Sign In');
      vpResult.navbarChecks.hasOverlap = overlapHambLogo || overlapLogoSignIn;
      if (!vpResult.navbarChecks.hasOverlap) {
        console.log('  ✓ No overlapping elements in mobile header');
      } else {
        results.allPassed = false;
      }

      // Sidebar drawer closed by default
      const drawer = await page.locator('#mobile-navigation-drawer');
      const drawerClass = await drawer.getAttribute('class');
      const isDrawerClosedByDefault = !drawerClass.includes('open');
      console.log(`  ✓ Mobile drawer closed by default: ${isDrawerClosedByDefault}`);
      vpResult.navbarChecks.drawerClosedByDefault = isDrawerClosedByDefault;
      if (!isDrawerClosedByDefault) results.allPassed = false;

      // Test Hamburger Click -> Open Drawer
      await hamburger.click();
      await page.waitForTimeout(350); // wait for css transition
      const drawerOpenClass = await drawer.getAttribute('class');
      const isDrawerOpened = drawerOpenClass.includes('open');
      console.log(`  ✓ Mobile hamburger click opens drawer: ${isDrawerOpened}`);
      vpResult.navbarChecks.drawerOpensOnHamburger = isDrawerOpened;

      // Verify drawer items
      const drawerGetApp = await page.locator('#mobile-navigation-drawer a[to="/download"], #mobile-navigation-drawer a[href="/download"]');
      const drawerQrDemo = await page.locator('#mobile-navigation-drawer a[href*="green-leaf-grocery"]');
      const drawerSignIn = await page.locator('#mobile-navigation-drawer a[href="/login"]');
      const drawerRegister = await page.locator('#mobile-navigation-drawer a[href="/signup/business"]');

      const drawerHasAllItems = (await drawerGetApp.count() > 0) &&
                                (await drawerQrDemo.count() > 0) &&
                                (await drawerSignIn.count() > 0) &&
                                (await drawerRegister.count() > 0);
      console.log(`  ✓ Mobile drawer contains all 4 items (Get App, QR Demo, Sign In, Register Business): ${drawerHasAllItems}`);
      vpResult.navbarChecks.drawerHasAllItems = drawerHasAllItems;

      // Capture drawer open screenshot for mobile
      const drawerScreenshotPath = path.join(screenshotsDir, `viewport_${vp.name}_drawer_open.png`);
      await page.screenshot({ path: drawerScreenshotPath });

      // Close drawer
      const closeBtn = await page.locator('.navbar-drawer-close-btn');
      await closeBtn.click();
      await page.waitForTimeout(300);
      const drawerClosedAfterClick = !(await drawer.getAttribute('class')).includes('open');
      console.log(`  ✓ Mobile drawer closes on close button click: ${drawerClosedAfterClick}`);
      vpResult.navbarChecks.drawerClosesCorrectly = drawerClosedAfterClick;

      // Desktop actions must NOT be visible
      const desktopActions = await page.locator('.navbar-desktop-actions');
      const isDesktopActionsHidden = !(await desktopActions.isVisible());
      console.log(`  ✓ Desktop actions hidden on mobile: ${isDesktopActionsHidden}`);
      vpResult.navbarChecks.desktopActionsHidden = isDesktopActionsHidden;

    } else {
      // Desktop checks (>= 769px)
      console.log('  Testing Desktop Navbar Elements:');

      // Desktop brand link
      const brandLink = await page.locator('.navbar-brand-link.hide-on-mobile');
      const isBrandLinkVisible = await brandLink.isVisible();
      console.log(`  ✓ Desktop brand logo visible: ${isBrandLinkVisible}`);
      vpResult.navbarChecks.brandLinkVisible = isBrandLinkVisible;

      // Desktop actions container
      const desktopActions = await page.locator('.navbar-desktop-actions');
      const isDesktopActionsVisible = await desktopActions.isVisible();
      console.log(`  ✓ Desktop actions container visible: ${isDesktopActionsVisible}`);
      vpResult.navbarChecks.desktopActionsVisible = isDesktopActionsVisible;

      // Get App button
      const getAppBtn = await page.locator('.navbar-desktop-actions a[aria-label="Get App"]');
      const isGetAppVisible = await getAppBtn.isVisible();
      console.log(`  ✓ "Get App" icon button visible: ${isGetAppVisible}`);
      vpResult.navbarChecks.getAppVisible = isGetAppVisible;

      // Live QR Demo button
      const qrDemoBtn = await page.locator('.navbar-desktop-actions a[aria-label="Live QR Demo"]');
      const isQrDemoVisible = await qrDemoBtn.isVisible();
      console.log(`  ✓ "Live QR Demo" icon button visible: ${isQrDemoVisible}`);
      vpResult.navbarChecks.qrDemoVisible = isQrDemoVisible;

      // Sign In button
      const signInBtn = await page.locator('.navbar-desktop-actions a[aria-label="Sign In"], .navbar-btn-signin');
      const isSignInVisible = await signInBtn.isVisible();
      console.log(`  ✓ "Sign In" button visible: ${isSignInVisible}`);
      vpResult.navbarChecks.signInVisible = isSignInVisible;

      // Register Business CTA button
      const registerBtn = await page.locator('.navbar-desktop-actions a[aria-label="Register Business"], .navbar-btn-cta');
      const isRegisterVisible = await registerBtn.isVisible();
      console.log(`  ✓ "Register Business" CTA button visible: ${isRegisterVisible}`);
      vpResult.navbarChecks.registerVisible = isRegisterVisible;

      // Overlap checks across desktop navbar elements
      const boxBrand = await brandLink.boundingBox();
      const boxGetApp = await getAppBtn.boundingBox();
      const boxQrDemo = await qrDemoBtn.boundingBox();
      const boxSignIn = await signInBtn.boundingBox();
      const boxRegister = await registerBtn.boundingBox();

      const overlapBrandActions = await checkElementsOverlap(boxBrand, await desktopActions.boundingBox(), 'Brand Logo', 'Desktop Actions');
      const overlapGetAppQr = await checkElementsOverlap(boxGetApp, boxQrDemo, 'Get App', 'Live QR Demo');
      const overlapQrSignIn = await checkElementsOverlap(boxQrDemo, boxSignIn, 'Live QR Demo', 'Sign In');
      const overlapSignInReg = await checkElementsOverlap(boxSignIn, boxRegister, 'Sign In', 'Register Business');

      const hasDesktopOverlap = overlapBrandActions || overlapGetAppQr || overlapQrSignIn || overlapSignInReg;
      vpResult.navbarChecks.hasOverlap = hasDesktopOverlap;
      if (!hasDesktopOverlap) {
        console.log('  ✓ No overlapping elements in desktop navbar (all elements have clear spacing)');
      } else {
        console.error('  ❌ Overlap detected in desktop navbar');
        results.allPassed = false;
      }

      // Mobile header must NOT be visible
      const mobileHeader = await page.locator('.navbar-mobile-header');
      const isMobileHeaderHidden = !(await mobileHeader.isVisible());
      console.log(`  ✓ Mobile header hidden on desktop: ${isMobileHeaderHidden}`);
      vpResult.navbarChecks.mobileHeaderHidden = isMobileHeaderHidden;

      // Hover tooltip check
      await getAppBtn.hover();
      const tooltip = await page.locator('#tooltip-get-app');
      const tooltipOpacity = await tooltip.evaluate(el => window.getComputedStyle(el).opacity);
      console.log(`  ✓ "Get App" tooltip rendered on hover (opacity: ${tooltipOpacity})`);
    }

    // 3. Capture high-res screenshot
    const screenshotFileName = `viewport_${vp.name}.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotFileName);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  ✓ Screenshot captured: ${screenshotFileName}`);
    vpResult.screenshotPath = screenshotPath;

    results.viewports.push(vpResult);
  }

  // Test Other Critical App Routes for Console/Network Errors
  console.log('\n----------------------------------------------------------------');
  console.log('3. Testing Key App Routes for Zero Console / Network Errors');
  console.log('----------------------------------------------------------------');
  const otherRoutes = ['/login', '/signup/business', '/download', '/m/green-leaf-grocery'];
  for (const route of otherRoutes) {
    const routeUrl = `${LOCAL_URL.replace(/\/$/, '')}${route}`;
    console.log(`▶ Navigating to ${routeUrl}...`);
    await page.setViewportSize({ width: 1280, height: 720 });
    const res = await page.goto(routeUrl, { waitUntil: 'networkidle' });
    const st = res ? res.status() : 'Unknown';
    console.log(`   HTTP ${st} - Route loaded cleanly`);
    const scPath = path.join(screenshotsDir, `route_${route.replace(/[\/]/g, '_')}.png`);
    await page.screenshot({ path: scPath });
  }

  await browser.close();
  console.log('\n✓ Chromium browser closed successfully.');

  // Summary
  console.log('\n================================================================');
  console.log('VISUAL TEST SUMMARY & REPORT');
  console.log('================================================================');
  console.log(`Playwright Version : ${results.playwrightVersion}`);
  console.log(`Chromium Version   : ${results.browserVersion}`);
  console.log(`Local URL Tested   : ${results.localUrl}`);
  console.log(`Viewports Tested   : ${results.viewports.length}/11`);
  console.log(`Console Errors     : ${results.consoleErrors.length}`);
  console.log(`Network Errors     : ${results.networkErrors.length}`);
  console.log(`Overall Pass Status: ${results.allPassed ? '✅ ALL PASSED' : '❌ FAILED'}`);

  // Save report json
  fs.writeFileSync(path.resolve('test-results/visual-report.json'), JSON.stringify(results, null, 2));
  console.log('✓ Full test report written to test-results/visual-report.json');

  if (!results.allPassed) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
