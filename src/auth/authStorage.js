/**
 * Centralized Authentication Storage Layer for ZOOR UP
 * Handles persistent authentication sessions across Web, PWA, and Android APK (React Native WebView).
 * 
 * Canonical Storage Keys:
 * - zoorup_token: Auth JWT or session bearer token
 * - zoorup_user: Authenticated user profile JSON
 */

export const AUTH_TOKEN_KEY = 'zoorup_token';
export const AUTH_USER_KEY = 'zoorup_user';

// Legacy keys supported for zero-friction migration
const LEGACY_TOKEN_KEYS = ['zoorup_auth_token', 'token', 'auth_token'];
const LEGACY_USER_KEYS = ['zoorup_current_user', 'user', 'currentUser'];

const isStorageAvailable = () => typeof localStorage !== 'undefined';
const isWindowAvailable = () => typeof window !== 'undefined';

/**
 * Safely writes to localStorage and mirrors across legacy keys
 */
const setLocalStorageItem = (key, value) => {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[AUTH STORAGE] Failed to write localStorage key: ${key}`, err);
  }
};

/**
 * Safely reads from localStorage
 */
const getLocalStorageItem = (key) => {
  if (!isStorageAvailable()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Safely removes item from localStorage
 */
const removeLocalStorageItem = (key) => {
  if (!isStorageAvailable()) return;
  try {
    localStorage.removeItem(key);
  } catch {}
};

/**
 * Notifies native React Native APK container (if running inside APK WebView)
 * to persist credentials into Android SecureStore (EncryptedSharedPreferences / Keystore).
 */
const notifyNativeContainer = (payload) => {
  if (!isWindowAvailable()) return;
  try {
    if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  } catch (err) {
    console.warn('[AUTH STORAGE] Could not notify native mobile container:', err);
  }
};

export const authStorage = {
  /**
   * Saves the authenticated session securely.
   * Persists both to web localStorage and native Android SecureStore via bridge.
   * @param {string} token - Bearer authentication token
   * @param {object} user - Authenticated user profile metadata
   */
  saveSession: (token, user) => {
    if (!token) return;

    // 1. Write canonical token and legacy mirrors
    setLocalStorageItem(AUTH_TOKEN_KEY, token);
    setLocalStorageItem('zoorup_auth_token', token);

    // 2. Write canonical user and legacy mirrors
    if (user) {
      const userStr = typeof user === 'string' ? user : JSON.stringify(user);
      setLocalStorageItem(AUTH_USER_KEY, userStr);
      setLocalStorageItem('zoorup_current_user', userStr);
    }

    // 3. Notify Android native APK container to save in SecureStore
    notifyNativeContainer({
      type: 'ZOORUP_SAVE_AUTH',
      token,
      user: user && typeof user === 'object' ? {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        phone: user.phone,
        business_id: user.business_id,
        customer_id: user.customer_id,
        status: user.status
      } : null
    });
  },

  /**
   * Retrieves active session credentials with auto-migration from legacy keys.
   * @returns {{ token: string | null, user: object | null }}
   */
  getSession: () => {
    if (!isStorageAvailable()) return { token: null, user: null };

    // 1. Resolve token
    let token = getLocalStorageItem(AUTH_TOKEN_KEY);
    if (!token) {
      for (const legacyKey of LEGACY_TOKEN_KEYS) {
        token = getLocalStorageItem(legacyKey);
        if (token) {
          // Auto-migrate to canonical key
          setLocalStorageItem(AUTH_TOKEN_KEY, token);
          break;
        }
      }
    }

    // Check sessionStorage fallback if not in localStorage
    if (!token && typeof sessionStorage !== 'undefined') {
      token = sessionStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem('zoorup_token');
      if (token) {
        setLocalStorageItem(AUTH_TOKEN_KEY, token);
      }
    }

    // 2. Resolve user
    let userStr = getLocalStorageItem(AUTH_USER_KEY);
    if (!userStr) {
      for (const legacyKey of LEGACY_USER_KEYS) {
        userStr = getLocalStorageItem(legacyKey);
        if (userStr) {
          // Auto-migrate to canonical key
          setLocalStorageItem(AUTH_USER_KEY, userStr);
          break;
        }
      }
    }

    let user = null;
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch {
        user = null;
      }
    }

    return { token: token || null, user };
  },

  /**
   * Gets the active bearer token
   * @returns {string | null}
   */
  getToken: () => {
    return authStorage.getSession().token;
  },

  /**
   * Gets the active cached user profile
   * @returns {object | null}
   */
  getUser: () => {
    return authStorage.getSession().user;
  },

  /**
   * Clears all session credentials across all storage keys and native SecureStore.
   */
  clearSession: () => {
    // 1. Remove canonical keys
    removeLocalStorageItem(AUTH_TOKEN_KEY);
    removeLocalStorageItem(AUTH_USER_KEY);

    // 2. Remove all legacy mirrors
    LEGACY_TOKEN_KEYS.forEach(k => removeLocalStorageItem(k));
    LEGACY_USER_KEYS.forEach(k => removeLocalStorageItem(k));

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_USER_KEY);
      sessionStorage.removeItem('zoorup_token');
    }

    // 3. Notify native APK container to clear SecureStore
    notifyNativeContainer({ type: 'ZOORUP_CLEAR_AUTH' });
  },

  /**
   * Returns authorization headers for fetch/HTTP requests
   * @returns {{ Authorization?: string }}
   */
  getAuthHeaders: () => {
    const token = authStorage.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
};
