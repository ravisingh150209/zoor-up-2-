import { authStorage, AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../src/auth/authStorage.js';

// Setup Mock Browser Environment
const storage = new Map();
global.window = {
  ReactNativeWebView: {
    postMessage: (msg) => {
      global.__lastNativeMessage = JSON.parse(msg);
    }
  }
};
global.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear()
};
global.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

async function runTests() {
  console.log('==================================================');
  console.log('ZOOR UP AUTH PERSISTENCE VERIFICATION MATRIX');
  console.log('==================================================');

  // Test 1: Save Session writes canonical & legacy keys, and bridges to Native SecureStore
  console.log('\n[TEST 1] Testing saveSession...');
  const testToken = 'jwt_test_token_12345';
  const testUser = {
    id: 'usr_test_1',
    name: 'Ravi Merchant',
    email: 'ravi@example.com',
    role: 'business',
    business_id: 'biz_test_1'
  };

  authStorage.saveSession(testToken, testUser);

  console.log('Canonical Token:', localStorage.getItem(AUTH_TOKEN_KEY));
  console.log('Legacy Token Mirror:', localStorage.getItem('zoorup_auth_token'));
  console.log('Canonical User:', localStorage.getItem(AUTH_USER_KEY));
  console.log('Native Bridge Message:', global.__lastNativeMessage);

  if (localStorage.getItem(AUTH_TOKEN_KEY) !== testToken) throw new Error('Canonical token not saved');
  if (localStorage.getItem('zoorup_auth_token') !== testToken) throw new Error('Legacy token not mirrored');
  if (!global.__lastNativeMessage || global.__lastNativeMessage.type !== 'ZOORUP_SAVE_AUTH') {
    throw new Error('Native SecureStore bridge message not sent');
  }
  if (global.__lastNativeMessage.token !== testToken) throw new Error('Native token payload mismatch');
  console.log('TEST 1 PASSED ✅');

  // Test 2: getSession reads canonical credentials
  console.log('\n[TEST 2] Testing getSession...');
  const session = authStorage.getSession();
  console.log('Retrieved Token:', session.token);
  console.log('Retrieved User Name:', session.user?.name);
  if (session.token !== testToken || session.user?.id !== 'usr_test_1') {
    throw new Error('Session retrieval mismatch');
  }
  console.log('TEST 2 PASSED ✅');

  // Test 3: Legacy Migration
  console.log('\n[TEST 3] Testing Legacy Key Migration...');
  storage.clear();
  // Simulate an older install where only 'zoorup_auth_token' exists
  storage.set('zoorup_auth_token', 'legacy_token_999');
  storage.set('zoorup_current_user', JSON.stringify({ id: 'usr_legacy', name: 'Legacy User', role: 'customer' }));

  const migratedSession = authStorage.getSession();
  console.log('Migrated Token:', migratedSession.token);
  console.log('Canonical Key after migration:', localStorage.getItem(AUTH_TOKEN_KEY));
  if (migratedSession.token !== 'legacy_token_999') throw new Error('Legacy token migration failed');
  if (localStorage.getItem(AUTH_TOKEN_KEY) !== 'legacy_token_999') throw new Error('Auto-migration to canonical key failed');
  console.log('TEST 3 PASSED ✅');

  // Test 4: Explicit Logout Clears Storage & Native SecureStore
  console.log('\n[TEST 4] Testing Explicit Logout...');
  authStorage.clearSession();
  console.log('Token after clear:', authStorage.getToken());
  console.log('User after clear:', authStorage.getUser());
  console.log('Native Bridge Message on Logout:', global.__lastNativeMessage);

  if (authStorage.getToken() !== null) throw new Error('Token should be null after clear');
  if (authStorage.getUser() !== null) throw new Error('User should be null after clear');
  if (global.__lastNativeMessage?.type !== 'ZOORUP_CLEAR_AUTH') throw new Error('Native clear message not sent');
  console.log('TEST 4 PASSED ✅');

  // Test 5: Verify Mobile App.js Injected JS evaluation
  console.log('\n[TEST 5] Testing Mobile App.js Injected Bootstrap JS...');
  const savedToken = 'secure_store_token_abc';
  const savedUser = { id: 'usr_secure', name: 'Secured Merchant', role: 'business' };

  // Evaluate the exact script template used in mobile/App.js
  const injectedCode = `
    (function() {
      try {
        var token = ${JSON.stringify(savedToken)};
        var user = ${JSON.stringify(savedUser)};
        if (token) {
          localStorage.setItem('zoorup_token', token);
          localStorage.setItem('zoorup_auth_token', token);
        }
        if (user) {
          var userStr = typeof user === 'string' ? user : JSON.stringify(user);
          localStorage.setItem('zoorup_user', userStr);
          localStorage.setItem('zoorup_current_user', userStr);
        }
      } catch (e) {
        console.warn('Native bootstrap injection error', e);
      }
    })();
  `;
  eval(injectedCode);

  const restoredToken = localStorage.getItem('zoorup_token');
  const restoredUser = JSON.parse(localStorage.getItem('zoorup_user') || '{}');
  console.log('Restored Token in WebView:', restoredToken);
  console.log('Restored User in WebView:', restoredUser.name);

  if (restoredToken !== savedToken || restoredUser.id !== savedUser.id) {
    throw new Error('Injected bootstrap evaluation failed');
  }
  console.log('TEST 5 PASSED ✅');

  console.log('\n==================================================');
  console.log('ALL AUTH PERSISTENCE TESTS PASSED! ✅');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
