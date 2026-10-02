import { authStorage, AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../src/auth/authStorage.js';
import { authService } from '../src/services/authService.js';

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

const BACKEND_URL = 'http://127.0.0.1:8000';

async function runLifecycleTests() {
  console.log('==================================================');
  console.log('ZOOR UP BACKEND SESSION & EXPIRATION LIFECYCLE TEST');
  console.log('==================================================');

  // Test 1: Register business on backend and save session
  console.log('\n[TEST 1] Registering business on backend...');
  const testEmail = `persist_owner_${Date.now()}@example.com`;
  const regResp = await fetch(`${BACKEND_URL}/api/auth/owner/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Persistence Store',
      email: testEmail,
      password: 'StrongPassword123!',
      phone: String(Date.now()).slice(-10)
    })
  });
  const regData = await regResp.json();
  console.log('Backend Register Status:', regResp.status);
  console.log('Received Access Token:', regData.access_token ? 'YES' : 'NO');
  console.log('User Role:', regData.user?.role);

  if (!regData.access_token) throw new Error('No access token returned from backend register');

  // Save session via authStorage
  authStorage.saveSession(regData.access_token, regData.user);

  // Test 2: App Startup / Session Validation via getMe()
  console.log('\n[TEST 2] Testing App Startup Session Validation (getMe)...');
  const meResult = await authService.getMe();
  console.log('getMe Result User Name:', meResult.user?.name);
  console.log('getMe Result Business Name:', meResult.business?.name);
  console.log('getMe Error:', meResult.error);

  if (!meResult.user || meResult.user.email !== testEmail) {
    throw new Error('getMe failed to validate and return authenticated user');
  }
  console.log('TEST 2 PASSED ✅');

  // Test 3: Simulated App Close and Reopen (Token preserved in storage)
  console.log('\n[TEST 3] Testing App Close & Reopen (Re-evaluating session)...');
  // Token remains in storage
  const reopenedSession = authStorage.getSession();
  console.log('Reopened Token Present:', Boolean(reopenedSession.token));
  console.log('Reopened User Present:', Boolean(reopenedSession.user));

  if (!reopenedSession.token || !reopenedSession.user) {
    throw new Error('Session was lost after closing app');
  }
  const reopenValidation = await authService.getMe();
  if (!reopenValidation.user) {
    throw new Error('Failed to validate session on app reopen');
  }
  console.log('Reopened Session Validated Successfully! User still logged in: ✅');
  console.log('TEST 3 PASSED ✅');

  // Test 4: Genuine 401 Unauthorized Expiration Handling
  console.log('\n[TEST 4] Testing 401 Expired Token Behavior...');
  // Set invalid/expired token
  authStorage.saveSession('invalid_expired_token_xyz', { id: 'usr_xyz', name: 'Expired User' });
  const expiredResult = await authService.getMe();
  console.log('Expired getMe Error:', expiredResult.error);
  console.log('Token in storage after 401:', authStorage.getToken());
  console.log('User in storage after 401:', authStorage.getUser());

  if (authStorage.getToken() !== null || authStorage.getUser() !== null) {
    throw new Error('Storage was NOT cleared on genuine 401 expired token');
  }
  console.log('401 correctly cleared storage and invalidated session: ✅');
  console.log('TEST 4 PASSED ✅');

  // Test 5: Offline Resilience (Network error must NOT clear session)
  console.log('\n[TEST 5] Testing Offline Resilience...');
  const offlineToken = 'offline_valid_token_777';
  const offlineUser = { id: 'usr_offline', name: 'Offline Merchant', role: 'business' };
  authStorage.saveSession(offlineToken, offlineUser);

  // Intentionally break fetch to simulate no internet / airplane mode
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new TypeError('Failed to fetch (Network offline)');
  };

  try {
    const offlineResult = await authService.getMe();
    console.log('Offline getMe User:', offlineResult.user?.name);
    console.log('Offline mode detected:', offlineResult.isOffline);
    console.log('Token still in storage during offline:', authStorage.getToken());

    if (!offlineResult.user || authStorage.getToken() !== offlineToken) {
      throw new Error('User was incorrectly logged out due to network failure!');
    }
    console.log('Offline resilience verified! User remains logged in during network failures: ✅');
    console.log('TEST 5 PASSED ✅');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('\n==================================================');
  console.log('ALL BACKEND AUTH LIFECYCLE TESTS PASSED! ✅');
  console.log('==================================================');
}

runLifecycleTests().catch(err => {
  console.error('LIFECYCLE TEST ERROR:', err);
  process.exit(1);
});
