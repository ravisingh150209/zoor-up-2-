import { isProductionEnvironment, localDB } from './storageSeed.js';

import { API_BASE_URL as API_BASE } from '../config/api.js';

export const LOYALTY_LEVELS = [
  { level: 1, name: 'BASIC', minPoints: 0, maxPoints: 499, color: '#1A2B49', accentColor: '#F59E0B', badge: 'BASIC MEMBER', perk: '1x Points on Purchases' },
  { level: 2, name: 'SILVER', minPoints: 500, maxPoints: 1499, color: '#334155', accentColor: '#CBD5E1', badge: 'SILVER VIP', perk: '1.2x Points + 5% off vouchers' },
  { level: 3, name: 'GOLD', minPoints: 1500, maxPoints: 2999, color: '#18181B', accentColor: '#F59E0B', badge: 'GOLD PRIVILEGE', perk: '1.5x Points + Priority Dispatch' },
  { level: 4, name: 'PLATINUM', minPoints: 3000, maxPoints: 4999, color: '#090D16', accentColor: '#38BDF8', badge: 'PLATINUM ELITE', perk: '2x Points + Free Delivery' },
  { level: 5, name: 'ADVANCE', minPoints: 5000, maxPoints: Infinity, color: '#000000', accentColor: '#A855F7', badge: 'ADVANCE PRESTIGE', perk: '2.5x Points + Exclusive VIP Access' },
];

export const RANK_TIERS = LOYALTY_LEVELS.map(l => ({
  rank: l.name,
  level: l.level,
  min: l.minPoints,
  max: l.maxPoints,
  color: l.color,
  accentColor: l.accentColor,
  badge: l.badge,
  perk: l.perk
}));

import { authStorage } from '../auth/authStorage.js';

export const REWARDS_CATALOG = [];

const buildLoyaltyError = async (resp, fallbackMessage = 'Unable to load loyalty data.') => {
  let detail = fallbackMessage;
  try {
    const payload = await resp.json();
    if (payload?.detail) {
      detail = payload.detail;
    }
  } catch (_) {
    // Ignore non-JSON error payloads and preserve the fallback message.
  }

  if (resp.status === 401) {
    return new Error('Session expired. Please log in again.');
  }
  if (resp.status === 403) {
    return new Error('You are not connected to this business.');
  }
  if (resp.status === 404) {
    return new Error('Loyalty data for this business was not found.');
  }
  if (resp.status >= 500) {
    return new Error('Server error while loading loyalty data.');
  }

  return new Error(detail || fallbackMessage);
};

export const formatVoucherAsOffer = (v) => {
  if (!v) return null;
  const id = v.voucher_id || v.id || v._id;
  const isActive = String(v.status || '').toUpperCase() === 'ACTIVE' || v.active === true;
  return {
    ...v,
    id: id,
    voucher_id: id,
    business_id: v.business_id,
    code: v.code || '',
    title: v.title || '',
    description: v.description || '',
    discount_type: (v.discount_type || 'PERCENTAGE').toUpperCase(),
    discount_val: Number(v.discount_value !== undefined ? v.discount_value : (v.discount_val || 0)),
    discount_value: Number(v.discount_value !== undefined ? v.discount_value : (v.discount_val || 0)),
    min_order: Number(v.minimum_order_value !== undefined ? v.minimum_order_value : (v.min_order || 0)),
    minimum_order_value: Number(v.minimum_order_value !== undefined ? v.minimum_order_value : (v.min_order || 0)),
    max_discount: Number(v.max_discount || 0),
    usage_limit: Number(v.usage_limit || 100),
    times_used: Number(v.total_claimed || v.times_used || 0),
    start_date: v.start_at || v.start_date || '',
    end_date: (v.expires_at ? String(v.expires_at).split('T')[0] : (v.end_date || '')),
    status: v.status || (isActive ? 'ACTIVE' : 'INACTIVE'),
    active: isActive,
    image_url: v.image_url || v.image || null,
  };
};

export const loyaltyService = {
  // Fetch Authoritative Backend Loyalty Status
  getLoyaltyStatus: async (token = null) => {
    const authToken = token || authStorage.getToken();
    if (!authToken) {
      throw new Error('Please log in to view loyalty data.');
    }

    const resp = await fetch(`${API_BASE}/api/customer/loyalty/status`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      throw await buildLoyaltyError(resp, 'Unable to load loyalty data.');
    }

    const data = await resp.json();
    if (!data || !data.success) {
      throw new Error('Unable to load loyalty data.');
    }
    return data;
  },

  getBusinessLoyalty: async (businessId, token = null) => {
    const authToken = token || authStorage.getToken();
    if (!authToken) {
      throw new Error('Please log in to view loyalty data.');
    }
    if (!businessId) {
      throw new Error('No business selected.');
    }

    const resp = await fetch(`${API_BASE}/api/loyalty/${encodeURIComponent(String(businessId))}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      throw await buildLoyaltyError(resp, 'Unable to load this business loyalty data.');
    }

    const data = await resp.json();
    if (!data || data.success === false) {
      throw new Error('Unable to load this business loyalty data.');
    }
    return data;
  },

  // Configurable Loyalty Levels & Progression
  getLevelInfo: (points = 0, customTiers = null) => {
    const tiers = (customTiers && customTiers.length >= 5) ? customTiers : LOYALTY_LEVELS;
    const pts = Math.max(0, Number(points) || 0);
    const currentTier = tiers.find(l => pts >= (l.minPoints ?? l.min_points ?? 0) && ((l.maxPoints ?? l.max_points) === Infinity || (l.maxPoints ?? l.max_points) === null || pts <= (l.maxPoints ?? l.max_points))) || tiers[0];
    const currentIndex = tiers.indexOf(currentTier);
    const nextTier = tiers[currentIndex + 1] || null;

    let progress = 100;
    let pointsNeeded = 0;

    const curMin = currentTier.minPoints ?? currentTier.min_points ?? 0;
    if (nextTier) {
      const nextMin = nextTier.minPoints ?? nextTier.min_points ?? 0;
      const range = nextMin - curMin;
      const gained = pts - curMin;
      if (range > 0) {
        progress = Math.min(100, Math.max(0, Math.round((gained / range) * 100)));
      }
      pointsNeeded = Math.max(0, nextMin - pts);
    }

    const normCurrentTier = currentTier ? { ...currentTier, rank: currentTier.name || currentTier.rank || 'BASIC' } : null;
    const normNextTier = nextTier ? { ...nextTier, rank: nextTier.name || nextTier.rank || '' } : null;

    return {
      currentLevel: currentTier.level,
      currentTier: normCurrentTier,
      nextTier: normNextTier,
      progress,
      pointsNeeded,
      totalPoints: pts,
    };
  },

  getRankInfo: (points = 0) => {
    return loyaltyService.getLevelInfo(points);
  },

  getTierByLevel: (level = 1, customTiers = null) => {
    const tiers = (customTiers && customTiers.length >= 5) ? customTiers : LOYALTY_LEVELS;
    return tiers.find(t => t.level === Number(level)) || tiers[0];
  },

  getOffers: async (businessId) => {
    if (!businessId) return [];
    try {
      // 1. Try public offers endpoint for this business
      const pubRes = await fetch(`${API_BASE}/api/public/offers/${encodeURIComponent(businessId)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        const list = Array.isArray(pubData.vouchers) ? pubData.vouchers : (Array.isArray(pubData.offers) ? pubData.offers : []);
        if (list.length > 0) {
          return list.map(formatVoucherAsOffer);
        }
      }

      // 2. If user is customer with token, try customer assigned vouchers
      const token = authStorage.getToken();
      if (token) {
        const custRes = await fetch(`${API_BASE}/api/customer/vouchers`, {
          headers: { ...authStorage.getAuthHeaders(), 'Accept': 'application/json' }
        });
        if (custRes.ok) {
          const custData = await custRes.json();
          if (Array.isArray(custData.vouchers)) {
            const bizVouchers = custData.vouchers
              .filter(v => (!businessId || v.business_id === businessId) && String(v.status || '').toUpperCase() === 'AVAILABLE')
              .map(formatVoucherAsOffer);
            if (bizVouchers.length > 0) return bizVouchers;
          }
        }
      }

      // 3. Fallback to business vouchers if authenticated owner
      const bizRes = await fetch(`${API_BASE}/api/business/vouchers`, {
        headers: { ...authStorage.getAuthHeaders(), 'Accept': 'application/json' }
      });
      if (bizRes.ok) {
        const bizData = await bizRes.json();
        const list = Array.isArray(bizData.vouchers) ? bizData.vouchers : (Array.isArray(bizData) ? bizData : []);
        return list
          .filter(v => (!businessId || v.business_id === businessId) && String(v.status || '').toUpperCase() === 'ACTIVE')
          .map(formatVoucherAsOffer);
      }
      return [];
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      return [];
    }
  },

  getAllOffersForBusiness: async (businessId) => {
    try {
      const response = await fetch(`${API_BASE}/api/business/vouchers`, {
        headers: {
          ...authStorage.getAuthHeaders(),
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        const raw = Array.isArray(data.vouchers) ? data.vouchers : (Array.isArray(data) ? data : []);
        return raw
          .filter(v => (!businessId || v.business_id === businessId) && v.status !== 'ARCHIVED')
          .map(formatVoucherAsOffer);
      }
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to load offers (${response.status})`);
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      return [];
    }
  },

  createOffer: async (businessId, offerData) => {
    const rawCode = (offerData.code || '').toUpperCase().replace(/\s+/g, '');
    const title = offerData.title || `Special Promo ${rawCode}`;
    const payload = {
      title: title,
      code: rawCode,
      description: offerData.description || '',
      discount_type: (offerData.discount_type || 'PERCENTAGE').toUpperCase(),
      discount_value: Number(offerData.discount_val !== undefined ? offerData.discount_val : (offerData.discount_value || 0)),
      minimum_order_value: Number(offerData.min_order !== undefined ? offerData.min_order : (offerData.minimum_order_value || 0)),
      usage_limit: Number(offerData.usage_limit || 100),
      start_at: offerData.start_date || new Date().toISOString(),
      expires_at: offerData.end_date ? `${offerData.end_date}T23:59:59` : undefined,
      status: 'ACTIVE',
      audience_type: 'ALL_ELIGIBLE',
    };

    const response = await fetch(`${API_BASE}/api/business/vouchers`, {
      method: 'POST',
      headers: {
        ...authStorage.getAuthHeaders(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to create offer (${response.status})`);
    }

    const resData = await response.json();
    return formatVoucherAsOffer(resData.voucher || resData);
  },

  updateOffer: async (id, updateData) => {
    const payload = {};
    if (updateData.title !== undefined) payload.title = updateData.title;
    if (updateData.code !== undefined) payload.code = updateData.code.toUpperCase().replace(/\s+/g, '');
    if (updateData.description !== undefined) payload.description = updateData.description;
    if (updateData.discount_type !== undefined) payload.discount_type = updateData.discount_type.toUpperCase();
    if (updateData.discount_val !== undefined || updateData.discount_value !== undefined) {
      payload.discount_value = Number(updateData.discount_val !== undefined ? updateData.discount_val : updateData.discount_value);
    }
    if (updateData.min_order !== undefined || updateData.minimum_order_value !== undefined) {
      payload.minimum_order_value = Number(updateData.min_order !== undefined ? updateData.min_order : updateData.minimum_order_value);
    }
    if (updateData.usage_limit !== undefined) payload.usage_limit = Number(updateData.usage_limit);
    if (updateData.end_date !== undefined) payload.expires_at = `${updateData.end_date}T23:59:59`;
    if (updateData.status !== undefined) payload.status = String(updateData.status).toUpperCase();
    if (updateData.active !== undefined) payload.status = updateData.active ? 'ACTIVE' : 'INACTIVE';

    const cleanId = String(id || '').trim();
    const response = await fetch(`${API_BASE}/api/business/vouchers/${encodeURIComponent(cleanId)}`, {
      method: 'PUT',
      headers: {
        ...authStorage.getAuthHeaders(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to update offer (${response.status})`);
    }

    const resData = await response.json();
    return formatVoucherAsOffer(resData.voucher || resData);
  },

  toggleOffer: async (id, currentActiveState) => {
    let nextStatus = 'INACTIVE';
    if (currentActiveState !== undefined) {
      nextStatus = currentActiveState ? 'INACTIVE' : 'ACTIVE';
    } else {
      try {
        const getRes = await fetch(`${API_BASE}/api/business/vouchers/${encodeURIComponent(id)}`, {
          headers: { ...authStorage.getAuthHeaders(), 'Accept': 'application/json' }
        });
        if (getRes.ok) {
          const getData = await getRes.json();
          const curr = getData.voucher || getData;
          nextStatus = String(curr.status || '').toUpperCase() === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        }
      } catch (_) {}
    }

    const cleanId = String(id || '').trim();
    const response = await fetch(`${API_BASE}/api/business/vouchers/${encodeURIComponent(cleanId)}`, {
      method: 'PUT',
      headers: {
        ...authStorage.getAuthHeaders(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ status: nextStatus })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to toggle offer (${response.status})`);
    }

    const resData = await response.json();
    return formatVoucherAsOffer(resData.voucher || resData);
  },

  deleteOffer: async (id) => {
    const cleanId = String(id || '').trim();
    const response = await fetch(`${API_BASE}/api/business/vouchers/${encodeURIComponent(cleanId)}`, {
      method: 'DELETE',
      headers: {
        ...authStorage.getAuthHeaders(),
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to delete offer (${response.status})`);
    }

    return true;
  },

  validateCoupon: async (businessId, code, orderTotal) => {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) return { valid: false, error: 'Enter a coupon code' };

    try {
      let offers = [];
      const res = await fetch(`${API_BASE}/api/business/vouchers`, {
        headers: { ...authStorage.getAuthHeaders(), 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        const raw = Array.isArray(data.vouchers) ? data.vouchers : (Array.isArray(data) ? data : []);
        offers = raw.map(formatVoucherAsOffer);
      } else {
        const custRes = await fetch(`${API_BASE}/api/customer/vouchers`, {
          headers: { ...authStorage.getAuthHeaders(), 'Accept': 'application/json' }
        });
        if (custRes.ok) {
          const custData = await custRes.json();
          offers = (custData.vouchers || []).map(formatVoucherAsOffer);
        }
      }

      const offer = offers.find(
        o => o.code.toUpperCase() === cleanCode && (!businessId || o.business_id === businessId) && o.active
      );

      if (!offer) {
        return { valid: false, error: 'Invalid coupon code or expired promo' };
      }

      if (Number(orderTotal) < Number(offer.min_order)) {
        return { valid: false, error: `Minimum order of ₹${offer.min_order} required for this coupon` };
      }

      let discountAmount = 0;
      if (offer.discount_type === 'PERCENTAGE') {
        discountAmount = Math.round((Number(orderTotal) * Number(offer.discount_val)) / 100);
        if (offer.max_discount && discountAmount > offer.max_discount) {
          discountAmount = offer.max_discount;
        }
      } else {
        discountAmount = Math.min(Number(orderTotal), Number(offer.discount_val));
      }

      return {
        valid: true,
        offer,
        discountAmount,
      };
    } catch (err) {
      return { valid: false, error: 'Unable to validate coupon at this time' };
    }
  },

  getRewards: async (businessId) => {
    try {
      const url = businessId ? `${API_BASE}/api/customer/rewards?business_id=${encodeURIComponent(businessId)}` : `${API_BASE}/api/customer/rewards`;
      const authToken = authStorage.getToken();
      const headers = { 'Accept': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const resp = await fetch(url, { headers });
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.rewards)) {
          return data.rewards;
        }
      }
    } catch (e) {
      console.warn('[LOYALTY] Failed to load rewards from API:', e);
    }
    return [];
  },

  createReward: async (businessId, rewardData) => {
    try {
      const code = `REW-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const payload = {
        title: rewardData.title,
        code: code,
        description: rewardData.description || `Redeemable for ${rewardData.points || 100} points`,
        discount_type: 'FIXED',
        discount_value: Number(rewardData.value || rewardData.points || 50),
        minimum_order_value: 0,
        usage_limit: 1000,
        status: 'ACTIVE',
        audience_type: 'ALL_ELIGIBLE',
      };
      const resp = await fetch(`${API_BASE}/api/business/vouchers`, {
        method: 'POST',
        headers: {
          ...authStorage.getAuthHeaders(),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const resData = await resp.json();
        return resData.voucher || resData;
      }
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to publish reward');
    } catch (e) {
      console.error('[LOYALTY] Failed to create reward on backend', e);
      throw e;
    }
  },

  claimReward: async (customerId, rewardId, businessId) => {
    const authToken = authStorage.getToken();
    if (!authToken) {
      throw new Error('Please log in as a customer to claim rewards.');
    }
    const resp = await fetch(`${API_BASE}/api/customer/rewards/claim`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ reward_id: rewardId, business_id: businessId }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.success) {
      return {
        success: true,
        voucher_code: data.voucher_code,
        redemption_code: data.redemption_code || data.voucher_code,
        claim: data.claim,
        remainingPoints: data.remaining_points ?? data.remainingPoints,
        remainingStamps: data.remaining_stamps ?? data.remainingStamps ?? 0,
      };
    }
    throw new Error(data.detail || 'Failed to claim reward');
  },

  getClaimedRewards: async (customerId) => {
    const authToken = authStorage.getToken();
    if (!authToken) return [];
    try {
      const resp = await fetch(`${API_BASE}/api/customer/rewards/claimed`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'application/json',
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.claims)) {
          return data.claims;
        }
      }
    } catch (e) {
      console.warn('[LOYALTY] Failed to load claimed rewards from API:', e);
    }
    return [];
  }
};
