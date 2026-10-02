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

    return {
      currentLevel: currentTier.level,
      currentTier,
      nextTier,
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
    await new Promise(r => setTimeout(r, 100));
    if (!businessId) return [];
    return localDB.getOffers().filter(o => o.business_id === businessId && o.active);
  },

  getAllOffersForBusiness: async (businessId) => {
    await new Promise(r => setTimeout(r, 100));
    if (!businessId) return [];
    return localDB.getOffers().filter(o => o.business_id === businessId);
  },

  createOffer: async (businessId, offerData) => {
    await new Promise(r => setTimeout(r, 200));
    const list = localDB.getOffers();
    const newOffer = {
      id: `off_${Date.now()}`,
      business_id: businessId,
      code: offerData.code.toUpperCase().replace(/\s+/g, ''),
      title: offerData.title || `Special Promo ${offerData.code}`,
      discount_type: offerData.discount_type || 'PERCENTAGE',
      discount_val: Number(offerData.discount_val),
      min_order: Number(offerData.min_order || 0),
      max_discount: Number(offerData.max_discount || 0),
      start_date: offerData.start_date || new Date().toISOString().split('T')[0],
      end_date: offerData.end_date || '2026-12-31',
      usage_limit: Number(offerData.usage_limit || 100),
      image_url: offerData.image_url || offerData.image || null,
      image: offerData.image_url || offerData.image || null,
      times_used: 0,
      active: true,
    };

    list.unshift(newOffer);
    localDB.saveOffers(list);
    return newOffer;
  },

  toggleOffer: async (id) => {
    const list = localDB.getOffers();
    const idx = list.findIndex(o => o.id === id);
    if (idx !== -1) {
      list[idx].active = !list[idx].active;
      localDB.saveOffers(list);
      return list[idx];
    }
    throw new Error('Offer not found');
  },

  validateCoupon: async (businessId, code, orderTotal) => {
    await new Promise(r => setTimeout(r, 150));
    const cleanCode = code.trim().toUpperCase();
    const offers = localDB.getOffers().filter(o => o.business_id === businessId && o.active);
    const offer = offers.find(o => o.code.toUpperCase() === cleanCode);

    if (!offer) {
      return { valid: false, error: 'Invalid coupon code' };
    }

    if (orderTotal < offer.min_order) {
      return { valid: false, error: `Minimum order of ₹${offer.min_order} required for this coupon` };
    }

    let discountAmount = 0;
    if (offer.discount_type === 'PERCENTAGE') {
      discountAmount = Math.round((orderTotal * offer.discount_val) / 100);
      if (offer.max_discount && discountAmount > offer.max_discount) {
        discountAmount = offer.max_discount;
      }
    } else {
      discountAmount = Math.min(orderTotal, offer.discount_val);
    }

    return {
      valid: true,
      offer,
      discountAmount,
    };
  },

  getRewards: async (businessId) => {
    try {
      const url = businessId ? `${API_BASE}/api/customer/rewards?business_id=${encodeURIComponent(businessId)}` : `${API_BASE}/api/customer/rewards`;
      const authToken = authStorage.getToken();
      if (authToken) {
        const resp = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Accept': 'application/json'
          }
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.rewards)) {
            return data.rewards;
          }
        }
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[LOYALTY] Failed to load rewards from API, falling back to localDB in dev', e);
    }

    const list = localDB.getRewards();
    if (!list) return [];
    return businessId ? list.filter((r) => r.business_id === businessId) : list;
  },

  createReward: async (businessId, rewardData) => {
    await new Promise((r) => setTimeout(r, 200));
    const newRew = {
      id: `rew_${Date.now()}`,
      business_id: businessId,
      title: rewardData.title,
      points: Number(rewardData.points || 0),
      stamps: Number(rewardData.stamps || 0),
      value: Number(rewardData.value || 0),
      category: rewardData.category || 'Voucher',
      image_url: rewardData.image_url || null,
      image: rewardData.image_url || null,
      active: true,
      created_at: new Date().toISOString(),
    };
    const current = localDB.getRewards() || [];
    const updated = [newRew, ...current];
    localDB.saveRewards(updated);
    return newRew;
  },

  claimReward: async (customerId, rewardId, businessId) => {
    try {
      const authToken = authStorage.getToken();
      if (authToken) {
        const resp = await fetch(`${API_BASE}/api/customer/rewards/claim`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ reward_id: rewardId, business_id: businessId })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          return {
            success: true,
            voucher_code: data.voucher_code,
            redemption_code: data.voucher_code,
            claim: data.claim,
            remainingPoints: data.remaining_points,
            remainingStamps: data.remaining_points
          };
        }
        if (!resp.ok) {
          throw new Error(data.detail || 'Failed to claim reward');
        }
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[LOYALTY] API claimReward failed, falling back in dev', e);
    }

    const allRewards = await loyaltyService.getRewards(businessId);
    const reward = allRewards.find(r => r.id === rewardId);
    if (!reward) throw new Error('Reward not found');

    const claimRecord = {
      id: `clm_${Date.now()}`,
      reward_id: reward.id,
      reward_title: reward.title,
      customer_id: customerId,
      voucher_code: `ZUP-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      claimed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString().split('T')[0],
      status: 'ACTIVE'
    };

    const CLAIMS_KEY = 'zoorup_claimed_rewards';
    let claims = [];
    try {
      const stored = localStorage.getItem(CLAIMS_KEY);
      if (stored) claims = JSON.parse(stored);
    } catch (e) {}
    claims.unshift(claimRecord);
    try {
      localStorage.setItem(CLAIMS_KEY, JSON.stringify(claims));
    } catch (e) {}

    return {
      success: true,
      voucher_code: claimRecord.voucher_code,
      redemption_code: claimRecord.voucher_code,
      claim: claimRecord,
      remainingPoints: 0,
      remainingStamps: 0
    };
  },

  getClaimedRewards: async (customerId) => {
    try {
      const authToken = authStorage.getToken();
      if (authToken) {
        const resp = await fetch(`${API_BASE}/api/customer/rewards/claimed`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Accept': 'application/json'
          }
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.claims)) {
            return data.claims;
          }
        }
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[LOYALTY] Failed to load claimed rewards from API, falling back in dev', e);
    }

    const CLAIMS_KEY = 'zoorup_claimed_rewards';
    try {
      const stored = localStorage.getItem(CLAIMS_KEY);
      if (stored) {
        const claims = JSON.parse(stored);
        return claims.filter(c => c.customer_id === customerId);
      }
    } catch (e) {}
    return [];
  }
};
