/**
 * ZOOR UP Direct UPI Subscription Service
 * Direct merchant UPI payment integration:
 * - Brand: ZOOR UP
 * - Platform UPI: configurable via backend (PLATFORM_UPI env)
 * 
 * Endpoints:
 * - GET  /api/subscriptions/plans
 * - GET  /api/subscriptions/current
 * - POST /api/subscriptions/payment/initiate
 * - GET  /api/subscriptions/payment/:paymentId
 * - POST /api/subscriptions/payment/:paymentId/verify
 * - POST /api/subscriptions/cancel
 * - GET  /api/subscriptions/history
 */
import { isProductionEnvironment, localDB, DEFAULT_PLANS } from './storageSeed.js';
import { authStorage } from '../auth/authStorage.js';

const scopedCache = new Map();
const inFlightRequests = new Map();
const CACHE_TTL_MS = 60 * 1000;

const getCacheKey = (businessId) => ['subscription', String(businessId || '').trim()].join(':');

import { API_BASE_URL } from '../config/api.js';

const getRequestHeaders = (extraHeaders = {}, hasBody = false) => {
  const headers = {
    'Accept': 'application/json',
    ...authStorage.getAuthHeaders(),
    ...extraHeaders,
  };
  if (hasBody || extraHeaders['Content-Type']) {
    headers['Content-Type'] = extraHeaders['Content-Type'] || 'application/json';
  }
  return headers;
};

const safeFetchJson = async (url, options = {}) => {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        status: res.status,
        isHtml: true,
        errorType: 'INVALID_RESPONSE',
        error: 'Subscription API returned non-JSON response.',
      };
    }

    const data = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      data,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      networkError: true,
      errorType: 'NETWORK_ERROR',
      error: 'Unable to reach server. Please check your internet connection.',
      originalError: err,
    };
  }
};

const notifySubscriptionChanged = (storeId) => {
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    try {
      window.dispatchEvent(
        new CustomEvent('zoorup:subscription-updated', {
          detail: { storeId },
        })
      );
    } catch (_) {}
  }
};

export const subscriptionService = {
  invalidateSubscriptionCache: (storeId) => {
    if (storeId) {
      const cleanStoreId =
        typeof storeId === 'object' && storeId !== null
          ? (storeId.business_id || storeId.store_id || storeId.id || '')
          : String(storeId || '').trim();
      const key = getCacheKey(cleanStoreId);
      scopedCache.delete(key);
      inFlightRequests.delete(key);
    } else {
      scopedCache.clear();
      inFlightRequests.clear();
    }
  },

  // 1. Authoritative Plans & Pricing
  getPlans: async () => {
    let res = await safeFetchJson(`${API_BASE_URL}/api/subscriptions/plans`, {
      headers: getRequestHeaders(),
    });

    if (!res.ok && res.status === 404) {
      res = await safeFetchJson(`${API_BASE_URL}/api/subscription/plans`, {
        headers: getRequestHeaders(),
      });
    }

    const rawPlans = Array.isArray(res.data)
      ? res.data
      : (res.data?.plans && Array.isArray(res.data.plans) ? res.data.plans : null);

    if (res.ok && rawPlans) {
      return rawPlans.map((p) => ({
        id: (p.id || p.plan_id || '').toUpperCase(),
        name: p.name || p.plan_name || (p.id || '').toUpperCase(),
        price: Number(p.monthly !== undefined ? p.monthly : (p.price !== undefined ? p.price : 0)),
        annualPrice: Number(p.annual !== undefined ? p.annual : (p.annualPrice !== undefined ? p.annualPrice : ((p.price || 0) * 10))),
        customerLimit: p.customer_limit || p.customerLimit || 1000,
        staffLimit: p.staff_limit || p.staffLimit || 10,
        features: Array.isArray(p.features) ? p.features : [],
        recommended: (p.id || '').toUpperCase() === 'GROWTH',
        is_paid: (p.id || '').toUpperCase() !== 'FREE',
      }));
    }

    if (isProductionEnvironment()) {
      throw new Error(res.error || 'Subscription plans are unavailable from the backend.');
    }
    return DEFAULT_PLANS;
  },

  // 2. Authoritative Business Subscription State
  getSubscription: async (storeId) => {
    if (!storeId) return null;
    const cleanStoreId =
      typeof storeId === 'object' && storeId !== null
        ? (storeId.business_id || storeId.store_id || storeId.id || '')
        : String(storeId || '').trim();

    if (!cleanStoreId || cleanStoreId === 'undefined' || cleanStoreId === 'null') {
      return null;
    }

    const cacheKey = getCacheKey(cleanStoreId);

    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    const cached = scopedCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const evaluationPromise = (async () => {
      let url = `${API_BASE_URL}/api/subscriptions/current?business_id=${encodeURIComponent(cleanStoreId)}`;
      let res = await safeFetchJson(url, { headers: getRequestHeaders() });

      if (!res.ok && res.status === 404) {
        url = `${API_BASE_URL}/api/subscription/current?business_id=${encodeURIComponent(cleanStoreId)}`;
        res = await safeFetchJson(url, { headers: getRequestHeaders() });
      }

      if (res.status === 401) {
        return {
          errorType: 'UNAUTHORIZED',
          error: 'Session expired. Please log in again.',
          business_id: cleanStoreId,
        };
      }

      if (res.status === 403) {
        return {
          errorType: 'FORBIDDEN',
          error: "You don't have permission to manage subscriptions.",
          business_id: cleanStoreId,
        };
      }

      if (res.status >= 500) {
        return {
          errorType: 'SERVER_ERROR',
          error: 'Server error while loading subscription. Please try again later.',
          business_id: cleanStoreId,
        };
      }

      if (res.networkError || res.isHtml || !res.ok) {
        const subs = localDB.getSubscriptions();
        const local = subs.find((s) => s.business_id === cleanStoreId);
        if (local) {
          return {
            ...local,
            can_access_premium: local.plan !== 'FREE',
            is_free: local.plan === 'FREE',
            is_offline: true,
          };
        }
        if (res.networkError) {
          return {
            errorType: 'NETWORK_ERROR',
            error: 'Unable to reach server. Please check your internet connection.',
            business_id: cleanStoreId,
          };
        }
      }

      if (res.ok && res.data?.success) {
        const data = res.data;
        let daysRemaining = null;
        if (data.current_period_end) {
          const diffMs = new Date(data.current_period_end).getTime() - Date.now();
          daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        }

        const state = {
          business_id: cleanStoreId,
          subscription_id: data.subscription_id,
          plan: data.plan,
          status: data.status,
          subscription_status: data.subscription_status || data.status,
          amount: data.amount,
          currency: data.currency || 'INR',
          billing_interval: data.billing_interval || 'monthly',
          auto_renew: Boolean(data.auto_renew),
          cancel_at_period_end: Boolean(data.cancel_at_period_end),
          current_period_start: data.current_period_start,
          current_period_end: data.current_period_end,
          next_billing_date: data.next_billing_date,
          days_remaining: daysRemaining,
          payment_status: data.payment_status,
          mandate_status: data.mandate_status,
          can_access_premium: Boolean(data.can_access_premium),
          is_free: Boolean(data.is_free),
          merchant_info: data.merchant_info,
        };

        scopedCache.set(cacheKey, { timestamp: Date.now(), data: state });
        return state;
      }

      const defaultFreeState = {
        business_id: cleanStoreId,
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
        merchant_info: {
          brand: 'ZOOR UP',
          merchant_upi: '8521893325@ybl',
        },
      };

      scopedCache.set(cacheKey, { timestamp: Date.now(), data: defaultFreeState });
      return defaultFreeState;
    })();

    inFlightRequests.set(cacheKey, evaluationPromise);
    try {
      return await evaluationPromise;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  },

  // 3. Initiate Direct UPI Payment
  // Frontend sends only plan_id. Backend loads plan_name, amount from server.
  initiateUpiPayment: async (storeId, planId, billingInterval = 'monthly') => {
    const cleanStoreId =
      typeof storeId === 'object' && storeId !== null
        ? (storeId.business_id || storeId.store_id || storeId.id || '')
        : String(storeId || '').trim();

    const planKey = String(planId || 'GROWTH').toUpperCase().trim();
    const planPrices = {
      FREE: { name: 'Free', monthly: 0, annual: 0 },
      STARTER: { name: 'Starter', monthly: 299, annual: 2990 },
      GROWTH: { name: 'Growth', monthly: 799, annual: 7990 },
      PRO: { name: 'Pro', monthly: 1499, annual: 14990 },
      PREMIUM: { name: 'Premium', monthly: 2499, annual: 24990 },
    };
    const info = planPrices[planKey] || planPrices.GROWTH;
    const amount = billingInterval === 'annual' ? info.annual : info.monthly;

    const generateDirectUpiUri = (amt, name, pid, platformUpi) => {
      const params = new URLSearchParams({
        pa: platformUpi || '8521893325@ybl',
        pn: 'ZOOR UP',
        am: String(amt),
        cu: 'INR',
        tn: pid ? `ZOOR UP - ${name} - ${pid}` : `ZOOR UP - ${name}`,
      });
      return `upi://pay?${params.toString()}`;
    };

    const payload = {
      plan_id: planKey.toLowerCase(),
      billing_interval: billingInterval,
      business_id: cleanStoreId,
    };

    let res = await safeFetchJson(`${API_BASE_URL}/api/subscriptions/payment/initiate`, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok && res.status === 404) {
      res = await safeFetchJson(`${API_BASE_URL}/api/subscription/payment/initiate`, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(payload),
      });
    }

    if (res.ok && res.data && res.data.upi_uri) {
      subscriptionService.invalidateSubscriptionCache(cleanStoreId);
      return {
        success: true,
        ...res.data,
      };
    }

    if (isProductionEnvironment()) {
      throw new Error(res.data?.detail || res.error || 'Subscription payment could not be initiated by the backend.');
    }

    // Development-only preview; production payments must have a backend record.
    const fallbackPaymentId = `pay_upi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const platformUpi = '8521893325@ybl'; // Fallback platform UPI
    const fallbackUri = generateDirectUpiUri(amount, info.name, fallbackPaymentId, platformUpi);
    return {
      success: true,
      payment_id: fallbackPaymentId,
      plan_id: planKey.toLowerCase(),
      plan_name: info.name,
      amount: amount,
      currency: 'INR',
      upi_id: platformUpi,
      upi_uri: fallbackUri,
      status: 'pending',
      is_fallback: true
    };
  },

  // 4. Check Payment Status
  getPaymentStatus: async (paymentId) => {
    if (!paymentId) return null;
    let res = await safeFetchJson(`${API_BASE_URL}/api/subscriptions/payment/${encodeURIComponent(paymentId)}`, {
      headers: getRequestHeaders(),
    });

    if (!res.ok && res.status === 404) {
      res = await safeFetchJson(`${API_BASE_URL}/api/subscription/payment/${encodeURIComponent(paymentId)}`, {
        headers: getRequestHeaders(),
      });
    }

    if (res.ok && res.data) {
      return res.data;
    }
    return null;
  },

  // 5. Verify Payment and Activate Plan
  verifyPayment: async (paymentId, payload = {}) => {
    if (!paymentId) return { success: false, error: 'Payment ID is required' };

    let res = await safeFetchJson(`${API_BASE_URL}/api/subscriptions/payment/${encodeURIComponent(paymentId)}/verify`, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok && res.status === 404) {
      res = await safeFetchJson(`${API_BASE_URL}/api/subscription/payment/${encodeURIComponent(paymentId)}/verify`, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(payload),
      });
    }

    if (res.ok && res.data?.success) {
      const cleanStoreId = authStorage.getUser()?.business_id;
      subscriptionService.invalidateSubscriptionCache(cleanStoreId);
      notifySubscriptionChanged(cleanStoreId);
      return res.data;
    }

    return {
      success: false,
      verified: false,
      status: 'pending',
      error: res.data?.detail || res.data?.error || 'Payment remains pending until an authorized administrator reconciles it.'
    };
  },

  // Unified single UPI payment for every paid plan
  initiatePlanPayment: async (storeId, planId, billingInterval = 'monthly') => {
    return subscriptionService.initiateUpiPayment(storeId, planId, billingInterval);
  },

  // Backward compatibility alias
  createSubscription: async (storeId, planId, billingInterval = 'monthly') => {
    return subscriptionService.initiateUpiPayment(storeId, planId, billingInterval);
  },

  verifySubscription: async (storeId, planId, paymentDetails = {}) => {
    const paymentId = paymentDetails.payment_id || paymentDetails.transaction_reference;
    return subscriptionService.verifyPayment(paymentId, paymentDetails);
  },

  // 6. Cancel Auto-Renew
  cancelAutoRenew: async (storeId, subscriptionId = null) => {
    const cleanStoreId =
      typeof storeId === 'object' && storeId !== null
        ? (storeId.business_id || storeId.store_id || storeId.id || '')
        : String(storeId || '').trim();

    const payload = {
      business_id: cleanStoreId,
      subscription_id: subscriptionId,
    };

    let res = await safeFetchJson(`${API_BASE_URL}/api/subscriptions/cancel`, {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok && res.status === 404) {
      res = await safeFetchJson(`${API_BASE_URL}/api/subscription/cancel`, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(payload),
      });
    }

    if (res.ok && res.data?.success) {
      subscriptionService.invalidateSubscriptionCache(cleanStoreId);
      notifySubscriptionChanged(cleanStoreId);
      return res.data;
    }

    return {
      success: false,
      errorType: res.networkError ? 'NETWORK_ERROR' : 'SERVER_ERROR',
      error: res.data?.detail || res.data?.error || 'Failed to cancel subscription',
    };
  },

  // 7. Payment History
  getPaymentHistory: async (storeId) => {
    const cleanStoreId =
      typeof storeId === 'object' && storeId !== null
        ? (storeId.business_id || storeId.store_id || storeId.id || '')
        : String(storeId || '').trim();

    let res = await safeFetchJson(`${API_BASE_URL}/api/subscriptions/payment-history?business_id=${encodeURIComponent(cleanStoreId)}`, {
      headers: getRequestHeaders(),
    });

    if (!res.ok && res.status === 404) {
      res = await safeFetchJson(`${API_BASE_URL}/api/subscriptions/history?business_id=${encodeURIComponent(cleanStoreId)}`, {
        headers: getRequestHeaders(),
      });
    }

    if (!res.ok && res.status === 404) {
      res = await safeFetchJson(`${API_BASE_URL}/api/subscription/payment-history?business_id=${encodeURIComponent(cleanStoreId)}`, {
        headers: getRequestHeaders(),
      });
    }

    if (!res.ok && res.status === 404) {
      res = await safeFetchJson(`${API_BASE_URL}/api/subscription/history?business_id=${encodeURIComponent(cleanStoreId)}`, {
        headers: getRequestHeaders(),
      });
    }

    const rawPayments = Array.isArray(res.data)
      ? res.data
      : (res.data?.payments && Array.isArray(res.data.payments) ? res.data.payments : null);

    if (res.ok && rawPayments) {
      return rawPayments;
    }

    const localPayments = localDB.getPayments();
    if (Array.isArray(localPayments) && localPayments.length > 0) {
      return cleanStoreId
        ? localPayments.filter(p => !p.business_id || p.business_id === cleanStoreId)
        : localPayments;
    }

    return [];
  },

  // 8. Admin Subscriptions
  getAdminSubscriptions: async () => {
    let res = await safeFetchJson(`${API_BASE_URL}/api/subscriptions/admin/all`, {
      headers: getRequestHeaders(),
    });

    if (res.ok && res.data?.subscriptions) {
      return res.data.subscriptions;
    }

    return [];
  },
};
