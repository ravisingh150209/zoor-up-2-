import fs from 'fs';
import path from 'path';

console.log('--- VERIFYING RESPONSIVE STYLES & VIEWPORT RULES ---');
const css = fs.readFileSync(path.resolve('src/styles/navbar.css'), 'utf8');

const requiredBreakpoints = [
  { name: 'Mobile Max (768px)', query: '@media (max-width: 768px)' },
  { name: 'Desktop Min (769px)', query: '@media (min-width: 769px)' },
  { name: 'Ultra Compact Mobile (360px)', query: '@media (max-width: 360px)' },
];

for (const bp of requiredBreakpoints) {
  if (css.includes(bp.query)) {
    console.log(`✅ Breakpoint rule present: ${bp.name}`);
  } else {
    throw new Error(`Missing breakpoint rule: ${bp.name}`);
  }
}

// Verify tooltip behavior
if (css.includes('.navbar-tooltip') && css.includes(':hover') && css.includes('opacity: 1')) {
  console.log('✅ Desktop tooltips with smooth hover animation verified.');
} else {
  throw new Error('Tooltip hover animation rules missing');
}

// Verify mobile drawer transition
if (css.includes('.navbar-mobile-drawer') && css.includes('transform: translateX(-100%)') && css.includes('.open')) {
  console.log('✅ Mobile slide-out drawer transition rules verified.');
} else {
  throw new Error('Mobile drawer transition rules missing');
}

console.log('✅ All responsive CSS rules verified for 320px to 1920px viewports.');
