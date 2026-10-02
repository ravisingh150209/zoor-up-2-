import { businessService } from './businessService.js';
import { isProductionEnvironment } from './storageSeed.js';
import { API_BASE_URL as API_BASE } from '../config/api.js';

export const QR_TYPES = {
  BUSINESS: 'business',
  MENU: 'menu',
  JOIN: 'join',
  CHECKIN: 'checkin',
  TABLE: 'table'
};

export const qrService = {
  /**
   * Generates standard ZOOR UP HTTPS QR URLs
   * @param {string} businessIdentifier - Business ID or Slug
   * @param {'business' | 'menu' | 'join' | 'checkin' | 'table'} type
   * @param {string} [tableId]
   * @returns {string} Standard HTTPS QR URL
   */
  generateStandardQRUrl: (businessIdentifier, type = 'business', tableId = null) => {
    const cleanId = String(businessIdentifier || '').trim();
    const origin = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://zoor-up-9b3a3.web.app';

    if (!cleanId) return origin;

    switch (type) {
      case 'menu':
        return `${origin}/b/${cleanId}/menu`;
      case 'join':
      case 'loyalty':
        return `${origin}/b/${cleanId}/join`;
      case 'checkin':
        return `${origin}/b/${cleanId}/checkin`;
      case 'table':
        return tableId ? `${origin}/b/${cleanId}/table/${tableId}` : `${origin}/b/${cleanId}/menu`;
      case 'business':
      default:
        return `${origin}/b/${cleanId}`;
    }
  },

  /**
   * Resolves a QR code string authoritative server/service side.
   * Handles:
   * 1. Standard HTTPS: /b/{id}, /b/{id}/menu, /b/{id}/join, /b/{id}/checkin, /b/{id}/table/{tbl}
   * 2. Legacy URLs: /menu/{id}, /m/{id}, /checkin/{id}, /loyalty/{id}
   * 3. Native Scheme: zoorup://b/{id}, zoorup://menu/{id}, zoorup://table/{id}/{tbl}
   * 4. JSON Payloads: {"v": 1, "type": "business", "business_id": "..."}
   * 5. Customer Universal Passes: /customer/{id} or ZUP-CUS-...
   */
  resolveQR: async (qrData) => {
    if (!qrData || typeof qrData !== 'string') {
      return { valid: false, success: false, error: 'Invalid QR Code. Please scan a ZOOR UP business QR code.' };
    }

    const trimmed = qrData.trim();
    const token = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('zoorup_token') || localStorage.getItem('zoorup_auth_token'))
      : null;

    // 1. Authoritative Backend QR Resolver
    try {
      const resp = await fetch(`${API_BASE}/api/qr/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ qr_data: trimmed })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && (data.valid || data.success)) {
          return {
            valid: true,
            success: true,
            ...data,
            target_url: data.destination || data.target_url || `/b/${data.business_slug || data.business_id}`
          };
        }
      } else {
        const errJson = await resp.json().catch(() => ({}));
        if (errJson?.detail) {
          return { valid: false, success: false, error: errJson.detail };
        }
      }
    } catch (netErr) {
      if ((typeof navigator !== 'undefined' && !navigator.onLine) || netErr?.name === 'TypeError') {
        if (isProductionEnvironment() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          return { valid: false, success: false, isNetworkError: true, error: 'Network connection error. Please check your internet and retry.' };
        }
      }
    }

    if (isProductionEnvironment()) {
      return { valid: false, success: false, error: 'QR validation service is unavailable. Please retry when online.' };
    }

    // 2. Client-side Fallback Engine
    // Check JSON QR payloads
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const json = JSON.parse(trimmed);
        const bizId = json.business_id || json.businessId || json.id;
        const bSlug = json.business_slug || json.slug || bizId;
        const rawType = (json.type || 'business').toLowerCase();

        const businesses = await businessService.getAllBusinesses();
        const biz = businesses.find(b => b.slug === bSlug || b.id === bSlug || b.id === bizId);
        const finalSlug = biz?.slug || bSlug || bizId;

        return {
          valid: true,
          success: true,
          type: rawType === 'menu' ? 'menu' : rawType === 'checkin' ? 'checkin' : rawType === 'loyalty' ? 'join' : 'business',
          business_id: biz?.id || bizId,
          business_slug: finalSlug,
          business_name: biz?.name || 'Partner Store',
          business: biz || null,
          table_id: json.table_id || json.tableId || null,
          destination: `/b/${finalSlug}`,
          target_url: `/b/${finalSlug}`
        };
      } catch (e) {}
    }

    // Check Standard /b/{id}/...
    const bTableRegex = /(?:https?:\/\/[^\/]+)?\/b\/([a-zA-Z0-9_-]+)\/table\/([a-zA-Z0-9_-]+)/i;
    const bTableMatch = trimmed.match(bTableRegex);
    if (bTableMatch) {
      const slug = bTableMatch[1];
      const tableId = bTableMatch[2];
      const businesses = await businessService.getAllBusinesses();
      const biz = businesses.find(b => b.slug === slug || b.id === slug);
      const finalSlug = biz?.slug || slug;
      return {
        valid: true,
        success: true,
        type: 'table',
        table_id: tableId,
        business_id: biz?.id || slug,
        business_slug: finalSlug,
        business_name: biz?.name || finalSlug,
        destination: `/b/${finalSlug}/table/${tableId}`,
        target_url: `/b/${finalSlug}/table/${tableId}`
      };
    }

    const bSubRegex = /(?:https?:\/\/[^\/]+)?\/b\/([a-zA-Z0-9_-]+)\/(menu|join|checkin|loyalty)/i;
    const bSubMatch = trimmed.match(bSubRegex);
    if (bSubMatch) {
      const slug = bSubMatch[1];
      const subType = bSubMatch[2].toLowerCase() === 'loyalty' ? 'join' : bSubMatch[2].toLowerCase();
      const businesses = await businessService.getAllBusinesses();
      const biz = businesses.find(b => b.slug === slug || b.id === slug);
      const finalSlug = biz?.slug || slug;
      return {
        valid: true,
        success: true,
        type: subType,
        business_id: biz?.id || slug,
        business_slug: finalSlug,
        business_name: biz?.name || finalSlug,
        destination: `/b/${finalSlug}/${subType}`,
        target_url: `/b/${finalSlug}/${subType}`
      };
    }

    const bRegex = /(?:https?:\/\/[^\/]+)?\/b\/([a-zA-Z0-9_-]+)/i;
    const bMatch = trimmed.match(bRegex);
    if (bMatch) {
      const slug = bMatch[1];
      const businesses = await businessService.getAllBusinesses();
      const biz = businesses.find(b => b.slug === slug || b.id === slug);
      const finalSlug = biz?.slug || slug;
      return {
        valid: true,
        success: true,
        type: 'business',
        business_id: biz?.id || slug,
        business_slug: finalSlug,
        business_name: biz?.name || finalSlug,
        destination: `/b/${finalSlug}`,
        target_url: `/b/${finalSlug}`
      };
    }

    // Check Legacy /menu/{slug} or /m/{slug}
    const menuRegex = /(?:https?:\/\/[^\/]+)?\/(?:menu|m)\/([a-zA-Z0-9_-]+)/i;
    const menuMatch = trimmed.match(menuRegex);
    if (menuMatch) {
      const slug = menuMatch[1];
      const businesses = await businessService.getAllBusinesses();
      const biz = businesses.find(b => b.slug === slug || b.id === slug);
      const finalSlug = biz?.slug || slug;
      return {
        valid: true,
        success: true,
        type: 'menu',
        business_id: biz?.id || slug,
        business_slug: finalSlug,
        business_name: biz?.name || finalSlug,
        destination: `/b/${finalSlug}/menu`,
        target_url: `/b/${finalSlug}/menu`
      };
    }

    // Check Legacy /checkin/{business_id}
    const checkinRegex = /(?:https?:\/\/[^\/]+)?\/checkin\/([a-zA-Z0-9_-]+)/i;
    const checkinMatch = trimmed.match(checkinRegex);
    if (checkinMatch) {
      const bizId = checkinMatch[1];
      const businesses = await businessService.getAllBusinesses();
      const biz = businesses.find(b => b.id === bizId || b.slug === bizId);
      const finalSlug = biz?.slug || bizId;
      return {
        valid: true,
        success: true,
        type: 'checkin',
        business_id: biz?.id || bizId,
        business_slug: finalSlug,
        business_name: biz?.name || 'Local Business',
        destination: `/b/${finalSlug}/checkin`,
        target_url: `/b/${finalSlug}/checkin`
      };
    }

    // Check Legacy /loyalty/{business_id}
    const loyaltyRegex = /(?:https?:\/\/[^\/]+)?\/(?:loyalty|join)\/([a-zA-Z0-9_-]+)/i;
    const loyaltyMatch = trimmed.match(loyaltyRegex);
    if (loyaltyMatch) {
      const bizId = loyaltyMatch[1];
      const businesses = await businessService.getAllBusinesses();
      const biz = businesses.find(b => b.id === bizId || b.slug === bizId);
      const finalSlug = biz?.slug || bizId;
      return {
        valid: true,
        success: true,
        type: 'join',
        business_id: biz?.id || bizId,
        business_slug: finalSlug,
        business_name: biz?.name || 'Local Store',
        destination: `/b/${finalSlug}/join`,
        target_url: `/b/${finalSlug}/join`
      };
    }

    // Check Customer Pass
    const customerRegex = /(?:https?:\/\/[^\/]+)?\/customer\/([a-zA-Z0-9_-]+)/i;
    const customerMatch = trimmed.match(customerRegex);
    if (customerMatch || trimmed.startsWith('ZUP-CUS-')) {
      const cusId = customerMatch ? customerMatch[1] : trimmed;
      return {
        valid: true,
        success: true,
        type: 'customer',
        customer_id: cusId,
        destination: `/customer/${cusId}`,
        target_url: `/customer/${cusId}`
      };
    }

    // Check direct business slug or ID match
    const businesses = await businessService.getAllBusinesses();
    const matchedBiz = businesses.find(b => b.slug === trimmed || b.id === trimmed);
    if (matchedBiz) {
      const finalSlug = matchedBiz.slug || matchedBiz.id;
      return {
        valid: true,
        success: true,
        type: 'business',
        business_id: matchedBiz.id,
        business_slug: finalSlug,
        business_name: matchedBiz.name,
        destination: `/b/${finalSlug}`,
        target_url: `/b/${finalSlug}`
      };
    }

    return {
      valid: false,
      success: false,
      error: 'Invalid QR Code. Please scan a ZOOR UP business QR code.'
    };
  },

  /**
   * Connects the authenticated customer to the business
   */
  connectBusiness: async (businessId, type = 'business', tableId = null) => {
    const token = typeof localStorage !== 'undefined'
      ? (localStorage.getItem('zoorup_token') || localStorage.getItem('zoorup_auth_token'))
      : null;

    if (!token) {
      return { success: false, error: 'Authentication required' };
    }

    try {
      const resp = await fetch(`${API_BASE}/api/qr/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          business_id: businessId,
          type,
          table_id: tableId,
          source: 'qr_scan'
        })
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        return { success: false, error: errJson.detail || 'Connection failed' };
      }

      return await resp.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Fetches public business storefront & catalog data
   */
  getPublicBusinessHub: async (businessIdentifier) => {
    try {
      const resp = await fetch(`${API_BASE}/api/public/b/${businessIdentifier}`);
      if (resp.ok) {
        return await resp.json();
      }
      return null;
    } catch (_) {
      return null;
    }
  }
};
