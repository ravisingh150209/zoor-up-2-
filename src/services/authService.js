import { localDB, isProductionEnvironment } from './storageSeed.js';
import { authStorage, AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../auth/authStorage.js';

// Active OTP store key
const OTP_STORE_KEY = 'zoorup_otp_store_v1';

import { API_BASE_URL } from '../config/api.js';

const getStorageInstance = () => {
  if (typeof localStorage !== 'undefined') return localStorage;
  if (typeof sessionStorage !== 'undefined') return sessionStorage;
  return null;
};

const getOtpStore = () => {
  try {
    const s = getStorageInstance();
    const data = s ? s.getItem(OTP_STORE_KEY) : null;
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

const setOtpStore = (data) => {
  try {
    const s = getStorageInstance();
    if (s) {
      s.setItem(OTP_STORE_KEY, JSON.stringify(data));
    }
  } catch (e) {
    console.error('Failed to store OTP state', e);
  }
};

export const authService = {
  // Read token from persistent storage
  getToken: () => {
    return authStorage.getToken();
  },

  // Save session & token using centralized authStorage
  setCurrentUser: (user, token) => {
    if (user) {
      const authToken = token || authStorage.getToken();
      if (!authToken) {
        authStorage.clearSession();
        return;
      }
      authStorage.saveSession(authToken, user);
    } else {
      authStorage.clearSession();
    }
  },

  // Explicit Logout
  logout: async () => {
    authStorage.clearSession();
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      try {
        window.dispatchEvent(new CustomEvent('zoorup:auth-logout', {}));
      } catch (_) {}
    }
    return { success: true };
  },

  // Get active authenticated session from local cache, validated against database
  getCurrentUser: () => {
    if (isProductionEnvironment()) return null;
    try {
      const user = authStorage.getUser();
      if (!user || !user.id) return null;

      // Cross-reference with persistent users in localDB if available
      const users = localDB.getUsers();
      const freshUser = users.find(u => u.id === user.id || (u.email && u.email.toLowerCase() === (user.email || '').toLowerCase()));
      if (freshUser) {
        // If business user, also cross-reference business status & name
        if (freshUser.role === 'business' && freshUser.business_id) {
          const businesses = localDB.getBusinesses();
          const biz = businesses.find(b => b.id === freshUser.business_id || b.owner_id === freshUser.id);
          if (biz) {
            return {
              ...freshUser,
              business_id: biz.id,
              business_name: biz.name || '',
              status: biz.status || 'ACTIVE',
              onboarding_completed: Boolean(biz.onboarding_completed),
              logo: biz.logo || null,
            };
          }
        }
        return freshUser;
      }
      return user;
    } catch (e) {
      console.error('Error reading auth session', e);
      return null;
    }
  },

  // GET /api/auth/me - Validate token and restore fresh user & business
  getMe: async () => {
    const { token, user: cachedUser } = authStorage.getSession();
    if (!token) {
      return { user: null, error: 'No active session' };
    }

    // 1. Validate against backend /api/auth/me
    const backendUrl = API_BASE_URL || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
    const meUrl = backendUrl ? `${backendUrl.replace(/\/+$/, '')}/api/auth/me` : '/api/auth/me';
    try {
      const resp = await fetch(meUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data?.user) {
          const rawRole = (data.user.role || '').toLowerCase();
          const cleanUser = {
            ...data.user,
            role: rawRole === 'business_owner' || rawRole === 'business' ? 'business' : (rawRole || 'customer')
          };
          authStorage.saveSession(token, cleanUser);
          return { user: cleanUser, business: data.business, error: null };
        }
      } else if (resp.status === 401) {
        // Genuine 401 Unauthorized: token revoked or expired
        console.warn('[AUTH] Server rejected token (401). Clearing session.');
        authStorage.clearSession();
        return { user: null, error: 'Session expired. Please log in again.' };
      } else if (isProductionEnvironment()) {
        return { user: null, error: 'Session could not be verified. Please try again.' };
      }
    } catch (err) {
      if (isProductionEnvironment()) {
        return { user: null, error: 'Authentication service is unavailable. Please try again.' };
      }
      // Network error or backend offline: DO NOT LOG OUT!
      console.warn('[AUTH] Session validation network issue, maintaining cached session:', err);
    }

    if (isProductionEnvironment()) {
      authStorage.clearSession();
      return { user: null, error: 'Session could not be verified. Please log in again.' };
    }

    // 2. Fallback: If cached user exists, keep user logged in!
    const localUser = authService.getCurrentUser() || cachedUser;
    if (localUser) {
      let business = null;
      if (localUser.business_id) {
        const businesses = localDB.getBusinesses();
        business = businesses.find(b => b.id === localUser.business_id || b.owner_id === localUser.id) || null;
      }
      return { user: localUser, business, error: null };
    }

    return { user: null, error: 'No active session' };
  },

  // Login handler
  login: async ({ identifier, password, role }) => {
    await new Promise((resolve) => setTimeout(resolve, 200));

    if (!identifier) {
      return { user: null, error: 'Please enter your email, phone, or customer ID.' };
    }

    const normalizedId = identifier.trim().toLowerCase();
    const cleanPhone = identifier.trim().replace(/\D/g, '');

    if ((role === 'customer' || role === 'business' || normalizedId.includes('@')) && password) {
      const backendUrl = API_BASE_URL || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
      const loginPath = role === 'business' ? '/api/auth/owner/login' : '/api/auth/customer/login';
      const loginUrl = backendUrl ? `${backendUrl.replace(/\/+$/, '')}${loginPath}` : loginPath;
      try {
        const resp = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ email: normalizedId, password })
        });

        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data?.user && data?.access_token) {
          const cleanUser = { ...data.user, role: role === 'business' ? 'business' : 'customer' };
          authStorage.saveSession(data.access_token, cleanUser);
          return { user: cleanUser, customer: data.customer, business: data.business, error: null };
        }
        if (!resp.ok) {
          return { user: null, error: data.detail || 'Invalid email or password.' };
        }
      } catch (err) {
        if (isProductionEnvironment()) {
          return { user: null, error: 'Authentication service is unavailable. Please try again.' };
        }
        console.warn('[AUTH] Customer backend login unavailable, falling back to local user cache.', err);
      }
      if (isProductionEnvironment()) {
        return { user: null, error: 'Authentication service is unavailable. Please try again.' };
      }
    }

    if (isProductionEnvironment()) {
      return { user: null, error: 'Authentication service is unavailable. Please try again.' };
    }

    const users = localDB.getUsers();
    const businesses = localDB.getBusinesses();
    const customers = localDB.getCustomers();

    // 1. Check in persistent users
    let matchedUser = users.find(u => {
      const emailMatch = u.email && u.email.toLowerCase() === normalizedId;
      const phoneMatch = cleanPhone && u.phone && u.phone.replace(/\D/g, '') === cleanPhone;
      const cusMatch = u.customer_id && u.customer_id.toLowerCase() === normalizedId;
      return emailMatch || phoneMatch || cusMatch;
    });

    // 2. If not found in users, check registered businesses directly
    if (!matchedUser) {
      const matchedBiz = businesses.find(b => 
        (b.email && b.email.toLowerCase() === normalizedId) ||
        (cleanPhone && b.phone && b.phone.replace(/\D/g, '') === cleanPhone)
      );
      if (matchedBiz) {
        matchedUser = {
          id: matchedBiz.owner_id || `usr_${matchedBiz.id}`,
          email: matchedBiz.email,
          phone: matchedBiz.phone || '',
          name: matchedBiz.owner_name || matchedBiz.name || 'Business Owner',
          role: 'business',
          business_id: matchedBiz.id,
          business_name: matchedBiz.name,
          status: matchedBiz.status || 'ACTIVE',
          onboarding_completed: Boolean(matchedBiz.onboarding_completed),
          auth_provider: 'email',
          created_at: matchedBiz.created_at,
          updated_at: new Date().toISOString(),
        };
        // Ensure this user exists in users table
        localDB.saveUsers([...users, matchedUser]);
      }
    }

    // 3. If not found, check registered customers directly
    if (!matchedUser && (!role || role === 'customer')) {
      const matchedCus = customers.find(c =>
        (c.email && c.email.toLowerCase() === normalizedId) ||
        (c.customer_id && c.customer_id.toLowerCase() === normalizedId) ||
        (cleanPhone && c.phone && c.phone.replace(/\D/g, '') === cleanPhone)
      );
      if (matchedCus) {
        matchedUser = {
          id: matchedCus.id,
          email: matchedCus.email,
          phone: matchedCus.phone,
          customer_id: matchedCus.customer_id,
          name: matchedCus.name,
          role: 'customer',
          rank: matchedCus.rank,
          points: matchedCus.points,
          avatar: matchedCus.avatar,
          auth_provider: 'email',
          created_at: matchedCus.joined_date || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    }

    if (matchedUser) {
      // Check business account status if business
      if (matchedUser.role === 'business' && matchedUser.business_id) {
        const biz = businesses.find(b => b.id === matchedUser.business_id || b.owner_id === matchedUser.id);
        if (biz) {
          if (biz.status === 'SUSPENDED') {
            return { user: null, error: 'Your business account is suspended. Please contact platform support.' };
          }
          if (biz.status === 'DEACTIVATED') {
            return { user: null, error: 'This business account has been deactivated.' };
          }
          matchedUser.status = biz.status || 'ACTIVE';
          matchedUser.onboarding_completed = Boolean(biz.onboarding_completed);
          matchedUser.business_name = biz.name || '';
        }
      }

      // Check customer loyalty and rank
      if (matchedUser.role === 'customer') {
        const cus = customers.find(c =>
          (c.customer_id && c.customer_id === matchedUser.customer_id) ||
          (c.email && c.email.toLowerCase() === (matchedUser.email || '').toLowerCase()) ||
          (c.phone && cleanPhone && c.phone.replace(/\D/g, '') === cleanPhone)
        );
        if (cus) {
          matchedUser.points = cus.points;
          matchedUser.rank = cus.rank;
          matchedUser.wallet_balance = cus.wallet_balance;
          matchedUser.customer_id = cus.customer_id;
          matchedUser.avatar = cus.avatar;
        }
      }

      authService.setCurrentUser(matchedUser);
      return { user: matchedUser, error: null };
    }

    // Fallback: If not found at all
    return {
      user: null,
      error: 'Invalid credentials. Please verify your email, phone, or customer ID and password.',
    };
  },

  // Register Business (Instant ACTIVE, Empty Profile, Strict Duplicate Prevention)
  registerBusiness: async (businessData) => {
    await new Promise((resolve) => setTimeout(resolve, 350));

    const normalizedEmail = (businessData.email || '').trim().toLowerCase();
    const cleanPhone = (businessData.phone || '').trim().replace(/\D/g, '');

    if (!normalizedEmail) {
      return {
        user: null,
        business: null,
        error: 'Email is required for business registration.',
        detail: 'Email is required for business registration.',
      };
    }

    const backendUrl = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const registerUrl = `${backendUrl.replace(/\/+$/, '')}/api/auth/owner/register`;
    try {
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: businessData.name || '',
          owner_name: businessData.owner_name || '',
          email: normalizedEmail,
          phone: businessData.phone || '',
          password: businessData.password,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.user && data.access_token) {
        const cleanUser = { ...data.user, role: 'business' };
        authStorage.saveSession(data.access_token, cleanUser);
        return { business: data.business, user: cleanUser, error: null };
      }
      if (!response.ok) {
        return { user: null, business: null, error: data.detail || 'Business registration failed.' };
      }
    } catch (error) {
      if (isProductionEnvironment()) {
        return { user: null, business: null, error: 'Authentication service is unavailable. Please try again.' };
      }
    }
    if (isProductionEnvironment()) {
      return { user: null, business: null, error: 'Authentication service is unavailable. Please try again.' };
    }

    const users = localDB.getUsers();
    const businesses = localDB.getBusinesses();

    // 1. Strict Duplicate Email Check
    const emailExists = users.some(u => u.email && u.email.trim().toLowerCase() === normalizedEmail) ||
      businesses.some(b => b.email && b.email.trim().toLowerCase() === normalizedEmail);

    if (emailExists) {
      return {
        user: null,
        business: null,
        error: 'An account with this email already exists. Please log in.',
        detail: 'An account with this email already exists. Please log in.',
      };
    }

    // 2. Strict Duplicate Phone Check (if provided)
    if (cleanPhone && cleanPhone.length >= 7) {
      const phoneExists = users.some(u => u.phone && u.phone.replace(/\D/g, '') === cleanPhone) ||
        businesses.some(b => b.phone && b.phone.replace(/\D/g, '') === cleanPhone);

      if (phoneExists) {
        return {
          user: null,
          business: null,
          error: 'An account with this phone number already exists. Please log in.',
          detail: 'An account with this phone number already exists. Please log in.',
        };
      }
    }

    // 3. Create permanent user record
    const userId = `usr_${Date.now()}`;
    const bizId = `biz_${Date.now()}`;
    const slug = (businessData.name || `store-${Date.now().toString(36)}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const newUser = {
      id: userId,
      email: normalizedEmail,
      phone: businessData.phone || '',
      name: businessData.owner_name || (businessData.name ? `${businessData.name} Owner` : ''),
      role: 'business',
      business_id: bizId,
      business_name: businessData.name || '',
      auth_provider: businessData.auth_provider || 'email',
      provider_user_id: businessData.provider_user_id || null,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const selectedPlan = (businessData.plan || businessData.selected_plan || businessData.subscription_plan || 'FREE').toUpperCase();
    const isFree = selectedPlan === 'FREE';
    const now = new Date();

    // 4. Create permanent business record (Always FREE by default for new registrations)
    const newBusiness = {
      id: bizId,
      owner_id: userId,
      name: businessData.name || '',
      owner_name: businessData.owner_name || '',
      phone: businessData.phone || '',
      email: normalizedEmail,
      logo: null,
      logo_url: null,
      cover_image: null,
      cover_photo_url: null,
      gallery: [],
      category: businessData.category || '',
      description: '',
      address: '',
      city: '',
      state: '',
      country: '',
      postal_code: '',
      website: '',
      opening_hours: {},
      gst_number: '',
      tax_number: '',
      slug: slug,
      status: 'ACTIVE',
      onboarding_completed: false,
      subscription_plan: 'FREE',
      subscription_status: 'ACTIVE',
      trial_status: 'NOT_APPLICABLE',
      trial_started_at: null,
      trial_ends_at: null,
      trial_used: false,
      payment_status: 'NOT_REQUIRED',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    // 5. Create authoritative Subscription record (Always FREE by default)
    const subscription = {
      business_id: bizId,
      store_id: bizId,
      user_id: userId,
      plan: 'FREE',
      status: 'ACTIVE',
      subscription_status: 'ACTIVE',
      amount: 0,
      currency: 'INR',
      billing_interval: 'monthly',
      auto_renew: false,
      cancel_at_period_end: false,
      payment_status: 'NOT_REQUIRED',
      mandate_status: 'none',
      can_access_premium: false,
      is_free: true,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    // 6. Persist to permanent storage
    localDB.saveUsers([newUser, ...users]);
    localDB.saveBusinesses([newBusiness, ...businesses]);
    const subscriptions = localDB.getSubscriptions();
    localDB.saveSubscriptions([subscription, ...subscriptions]);

    // 7. Set session
    authService.setCurrentUser(newUser);

    return { business: newBusiness, user: newUser, error: null };
  },

  loginWithGoogle: async ({ token, role = 'CUSTOMER' }) => {
    if (!token) return { user: null, error: 'Google did not return a verified sign-in token.' };

    const backendUrl = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const authUrl = `${backendUrl.replace(/\/+$/, '')}/api/auth/google`;
    try {
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user || !data.access_token) {
        return { user: null, error: data.detail || 'Google sign-in could not be verified.' };
      }

      const cleanUser = {
        ...data.user,
        role: (data.user.role || '').toLowerCase() === 'business_owner' ? 'business' : (data.user.role || 'customer').toLowerCase(),
      };
      authStorage.saveSession(data.access_token, cleanUser);
      return { user: cleanUser, business: data.business, customer: data.customer, error: null };
    } catch {
      return { user: null, error: 'Authentication service is unavailable. Please try again.' };
    }
  },

  // Register Customer (Duplicate checks + Permanent record)
  registerCustomer: async ({ name, phone, email, password }) => {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const normalizedEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').trim();

    if (!normalizedEmail) {
      return { customer: null, user: null, error: 'Email is required for customer registration.' };
    }
    if (!password) {
      return { customer: null, user: null, error: 'Password is required for customer registration.' };
    }

    const backendUrl = API_BASE_URL || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
    const registerUrl = backendUrl ? `${backendUrl.replace(/\/+$/, '')}/api/auth/customer/register` : '/api/auth/customer/register';
    try {
      const resp = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name, phone: cleanPhone, email: normalizedEmail, password })
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.user && data?.access_token) {
        const cleanUser = { ...data.user, role: 'customer' };
        authStorage.saveSession(data.access_token, cleanUser);
        return { customer: data.customer, user: cleanUser, error: null };
      }
      if (!resp.ok) {
        return { customer: null, user: null, error: data.detail || 'Customer registration failed.' };
      }
    } catch (err) {
      if (isProductionEnvironment()) {
        return { customer: null, user: null, error: 'Authentication service is unavailable. Please try again.' };
      }
      console.warn('[AUTH] Customer backend registration unavailable, falling back to local user cache.', err);
    }
    if (isProductionEnvironment()) {
      return { customer: null, user: null, error: 'Authentication service is unavailable. Please try again.' };
    }

    const users = localDB.getUsers();
    const customers = localDB.getCustomers();

    if (normalizedEmail) {
      const emailExists = users.some(u => u.email && u.email.trim().toLowerCase() === normalizedEmail) ||
        customers.some(c => c.email && c.email.trim().toLowerCase() === normalizedEmail);
      if (emailExists) {
        return {
          customer: null,
          user: null,
          error: 'An account with this email already exists. Please log in.',
          detail: 'An account with this email already exists. Please log in.',
        };
      }
    }

    const cleanPhoneDigits = cleanPhone.replace(/\D/g, '');
    if (cleanPhoneDigits && cleanPhoneDigits.length >= 7) {
      const phoneExists = users.some(u => u.phone && u.phone.replace(/\D/g, '') === cleanPhoneDigits) ||
        customers.some(c => c.phone && c.phone.replace(/\D/g, '') === cleanPhoneDigits);
      if (phoneExists) {
        return {
          customer: null,
          user: null,
          error: 'An account with this phone number already exists. Please log in.',
          detail: 'An account with this phone number already exists. Please log in.',
        };
      }
    }

    const count = customers.length + 1;
    const formattedId = `ZUP-CUS-${String(count).padStart(6, '0')}`;
    const cusId = `cus_${Date.now()}`;
    const userId = `usr_${cusId}`;

    const newCustomer = {
      id: cusId,
      customer_id: formattedId,
      name,
      phone: cleanPhone,
      email: normalizedEmail || `${formattedId.toLowerCase()}@zoorup.user`,
      avatar: null,
      profile_image_url: null,
      rank: 'Bronze',
      membership_tier: 'MEMBER',
      segment: 'NEW',
      points: 0,
      lifetime_points: 0,
      stamps: 0,
      wallet_balance: 0,
      total_orders: 0,
      total_spent: 0,
      total_visits: 0,
      last_visit: new Date().toISOString(),
      joined_date: new Date().toISOString().split('T')[0],
      notes: 'Registered customer',
    };

    const newUser = {
      id: userId,
      email: newCustomer.email,
      phone: newCustomer.phone,
      name: newCustomer.name,
      role: 'customer',
      customer_id: formattedId,
      avatar: null,
      profile_image_url: null,
      rank: newCustomer.rank,
      points: newCustomer.points,
      wallet_balance: newCustomer.wallet_balance,
      auth_provider: 'email',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localDB.saveCustomers([newCustomer, ...customers]);
    localDB.saveUsers([newUser, ...users]);

    authService.setCurrentUser(newUser);
    return { customer: newCustomer, user: newUser, error: null };
  },

  // Phone normalization standard (+91XXXXXXXXXX)
  normalizePhone: (phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (String(phone).trim().startsWith('+')) return `+${digits}`;
    return `+91${digits}`;
  },

  // POST /api/auth/otp/request
  requestOTP: async (phone, purpose = 'LOGIN') => {
    await new Promise((r) => setTimeout(r, 150));
    const cleanPhone = authService.normalizePhone(phone);
    const digitsOnly = cleanPhone.replace(/\D/g, '');
    if (!cleanPhone || digitsOnly.length < 10) {
      return { success: false, error: 'Enter a valid 10-digit Indian mobile number.' };
    }

    const isProd = typeof isProductionEnvironment === 'function' ? isProductionEnvironment() : false;
    const apiUrl = API_BASE_URL ? `${API_BASE_URL.replace(/\/+$/, '')}/api/auth/otp/request` : '/api/auth/otp/request';

    // 1. Send OTP Request to Backend
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, purpose }),
      });

      if (resp.ok) {
        const apiData = await resp.json();
        return {
          success: true,
          phone: cleanPhone,
          maskedPhone: apiData.masked_phone,
          message: apiData.message || `Verification code sent to ${cleanPhone}.`,
          expiresInSeconds: apiData.expires_in_seconds || 300,
          resendCooldownSeconds: apiData.resend_cooldown_seconds || 60,
          requestId: apiData.request_id,
          deliveryStatus: apiData.delivery_status,
        };
      } else {
        const errData = await resp.json().catch(() => ({}));
        // Direct backend error (e.g. 503 unconfigured provider, 429 rate limit, 400 invalid number)
        return {
          success: false,
          error: errData.detail || 'Unable to send OTP. Please try again.',
        };
      }
    } catch (networkErr) {
      if (isProd) {
        return {
          success: false,
          error: 'SMS service is temporarily unavailable. Please try again.',
        };
      }
    }

    // Offline / Standalone Mock fallback ONLY for non-production environments
    const now = Date.now();
    const store = getOtpStore();
    const existing = store[cleanPhone];

    if (existing && existing.lastRequested) {
      const elapsed = (now - existing.lastRequested) / 1000;
      if (elapsed < 60) {
        const remaining = Math.ceil(60 - elapsed);
        return {
          success: false,
          error: `Please wait ${remaining}s before requesting a new OTP.`,
          cooldownRemaining: remaining,
        };
      }
    }

    const history = (existing?.requestHistory || []).filter((t) => now - t < 15 * 60 * 1000);
    if (history.length >= 5) {
      return {
        success: false,
        error: 'Too many OTP requests for this phone number. Please try again in 15 minutes.',
      };
    }
    history.push(now);

    const secureRandomCode = String(Math.floor(100000 + Math.random() * 900000));
    const salt = String(Math.random().toString(36).substring(2, 10));

    const simpleHash = (str, s) => {
      let hash = 0;
      const combined = `${str}:${s}`;
      for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
      }
      return String(hash);
    };

    const hashedOtp = simpleHash(secureRandomCode, salt);
    store[cleanPhone] = {
      phone: cleanPhone,
      otpHash: hashedOtp,
      otp_hash: hashedOtp,
      rawCode: !isProd ? secureRandomCode : null,
      salt: salt,
      purpose: purpose.toUpperCase(),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: now + 5 * 60 * 1000,
      expires_at: now + 5 * 60 * 1000,
      lastRequested: now,
      requestHistory: history,
    };
    setOtpStore(store);

    return {
      success: true,
      phone: cleanPhone,
      message: `Verification code sent to ${cleanPhone}.`,
      expiresInSeconds: 300,
      resendCooldownSeconds: 60,
      ...(!isProd ? { testOtp: secureRandomCode } : {}),
    };
  },

  // POST /api/auth/otp/verify
  verifyOTP: async (phone, enteredOtp, customerName = '', purpose = 'LOGIN') => {
    await new Promise((r) => setTimeout(r, 150));
    const cleanPhone = authService.normalizePhone(phone);
    const code = String(enteredOtp || '').trim();

    if (!cleanPhone || !code) {
      return { user: null, customer: null, error: 'Phone number and verification code are required.' };
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return { user: null, customer: null, error: 'Verification code must be exactly 6 numeric digits.' };
    }

    const isProd = typeof isProductionEnvironment === 'function' ? isProductionEnvironment() : false;
    const apiUrl = API_BASE_URL ? `${API_BASE_URL.replace(/\/+$/, '')}/api/auth/otp/verify` : '/api/auth/otp/verify';

    // 1. Verify via Backend API
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          code: code,
          purpose: purpose.toUpperCase(),
          name: customerName,
        }),
      });

      if (resp.ok) {
        const apiData = await resp.json();
        if (apiData.user && apiData.access_token) {
          authService.setCurrentUser(apiData.user, apiData.access_token);
          // Sync with localDB to ensure consistency across offline services
          if (!isProd) {
            const users = localDB.getUsers();
            if (!users.some(u => u.id === apiData.user.id || u.phone === apiData.user.phone)) {
              localDB.saveUsers([apiData.user, ...users]);
            }
            if (apiData.customer) {
              const customers = localDB.getCustomers();
              if (!customers.some(c => c.id === apiData.customer.id || c.customer_id === apiData.customer.customer_id)) {
                localDB.saveCustomers([apiData.customer, ...customers]);
              }
            }
          }
          return {
            user: apiData.user,
            customer: apiData.customer,
            isNew: apiData.is_new,
            token: apiData.access_token,
            error: null,
          };
        }
      } else {
        const errData = await resp.json().catch(() => ({}));
        return { user: null, customer: null, error: errData.detail || 'Incorrect OTP.' };
      }
    } catch (networkErr) {
      if (isProd) {
        return { user: null, customer: null, error: 'Authentication service temporarily unavailable.' };
      }
    }

    if (isProd) {
      return { user: null, customer: null, error: 'Authentication service temporarily unavailable.' };
    }

    const store = getOtpStore();
    const record = store[cleanPhone];
    const now = Date.now();

    if (!record) {
      // In development test runs, allow 123456 if no record exists
      if (!isProd && code === '123456') {
        // permitted in non-production automated test runs
      } else {
        return { user: null, customer: null, error: 'No active OTP found. Please request a new verification code.' };
      }
    } else {
      // 1. Check Expiration (5 minutes)
      const expiryTime = record.expires_at || record.expiresAt || 0;
      if (now > expiryTime) {
        delete store[cleanPhone];
        setOtpStore(store);
        return { user: null, customer: null, error: 'Verification code has expired. Please request a new code.' };
      }

      // 2. Check Attempt Limit (5 attempts)
      if (record.attempts >= 5) {
        delete store[cleanPhone];
        setOtpStore(store);
        return {
          user: null,
          customer: null,
          error: 'Maximum verification attempts exceeded. Please request a new OTP.',
        };
      }

      // 3. Verify Code
      const simpleHash = (str, s) => {
        let hash = 0;
        const combined = `${str}:${s}`;
        for (let i = 0; i < combined.length; i++) {
          const char = combined.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash |= 0;
        }
        return String(hash);
      };

      const candidateHash = simpleHash(code, record.salt);
      const isMatch = candidateHash === record.otpHash || (!isProd && code === '123456');

      if (!isMatch) {
        record.attempts = (record.attempts || 0) + 1;
        const remaining = Math.max(0, 5 - record.attempts);
        if (record.attempts >= 5) {
          delete store[cleanPhone];
          setOtpStore(store);
          return {
            user: null,
            customer: null,
            error: 'Maximum verification attempts exceeded. This OTP has been invalidated.',
          };
        }
        store[cleanPhone] = record;
        setOtpStore(store);
        return {
          user: null,
          customer: null,
          error: `Invalid verification code. ${remaining} attempts remaining.`,
        };
      }

      // Clean up verified OTP
      delete store[cleanPhone];
      setOtpStore(store);
    }

    // Provision or Load Customer Account with ZERO Demo Data
    const users = localDB.getUsers();
    const customers = localDB.getCustomers();

    const digitsOnly = cleanPhone.replace(/\D/g, '');
    let matchedCustomer = customers.find(
      (c) => c.phone && c.phone.replace(/\D/g, '') === digitsOnly
    );
    let matchedUser = users.find(
      (u) => u.phone && u.phone.replace(/\D/g, '') === digitsOnly
    );

    if (matchedCustomer) {
      if (!matchedUser) {
        matchedUser = {
          id: `usr_${matchedCustomer.id}`,
          email: matchedCustomer.email || '',
          phone: matchedCustomer.phone,
          customer_id: matchedCustomer.customer_id,
          name: matchedCustomer.name,
          role: 'customer',
          rank: matchedCustomer.rank || 'Bronze',
          points: matchedCustomer.points || 0,
          avatar: null,
          profile_image_url: null,
          auth_provider: 'phone',
          created_at: matchedCustomer.joined_date || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        localDB.saveUsers([...users, matchedUser]);
      }
      authService.setCurrentUser(matchedUser);
      return { user: matchedUser, customer: matchedCustomer, isNew: false, error: null };
    }

    // New Customer Registration (ZERO Demo Data Default)
    const count = customers.length + 1;
    const formattedId = `ZUP-CUS-${String(count).padStart(6, '0')}`;
    const cusId = `cus_${Date.now()}`;
    const userId = `usr_${cusId}`;
    const displayName = customerName.trim() || `Customer ${cleanPhone.slice(-4)}`;

    const newCustomer = {
      id: cusId,
      customer_id: formattedId,
      name: displayName,
      phone: cleanPhone,
      email: '',
      avatar: null,
      profile_image_url: null,
      rank: 'Bronze',
      membership_tier: 'MEMBER',
      segment: 'NEW',
      points: 0,
      lifetime_points: 0,
      stamps: 0,
      wallet_balance: 0,
      total_orders: 0,
      total_spent: 0.0,
      total_visits: 0,
      rewards: [],
      history: [],
      joined_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      notes: 'Registered via Real Phone OTP',
    };

    const newUser = {
      id: userId,
      email: '',
      phone: cleanPhone,
      name: displayName,
      role: 'customer',
      customer_id: formattedId,
      avatar: null,
      profile_image_url: null,
      auth_provider: 'phone',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localDB.saveCustomers([newCustomer, ...customers]);
    localDB.saveUsers([newUser, ...users]);
    authService.setCurrentUser(newUser);

    return { customer: newCustomer, user: newUser, isNew: true, error: null };
  },

  // PUT /api/user/profile
  updateUserProfile: async (userId, updates) => {
    await new Promise(r => setTimeout(r, 200));
    const users = localDB.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...updates, updated_at: new Date().toISOString() };
      localDB.saveUsers(users);

      const current = authService.getCurrentUser();
      if (current && current.id === userId) {
        authService.setCurrentUser(users[idx]);
      }
      return { user: users[idx], error: null };
    }
    return { user: null, error: 'User not found' };
  },

  // Logout (Clears session ONLY, NEVER deletes permanent database records)
  logout: async () => {
    authService.setCurrentUser(null);
  },

  // Password reset request
  forgotPassword: async (email) => {
    if (isProductionEnvironment()) {
      return { success: false, error: 'Password reset is not available from the authentication service yet.' };
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    return { success: true, message: `Password reset link sent to ${email}` };
  },

  getDemoAccounts: () => {
    if (isProductionEnvironment()) {
      return [];
    }
    return localDB.getUsers().slice(0, 5);
  },
};
