import { isProductionEnvironment, localDB } from './storageSeed.js';
import { authStorage } from '../auth/authStorage.js';
import { API_BASE_URL as API_BASE } from '../config/api.js';

export const paymentService = {
  getPayments: async (businessId, filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'ALL') params.append('status', filters.status);
      if (filters.mode && filters.mode !== 'ALL') params.append('mode', filters.mode);
      if (filters.search) params.append('search', filters.search);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      if (filters.sort_by) params.append('sort_by', filters.sort_by);
      if (filters.sort_dir) params.append('sort_dir', filters.sort_dir);

      const resp = await fetch(`${API_BASE}/api/payments/business?${params.toString()}`, {
        headers: {
          'Accept': 'application/json',
          ...authStorage.getAuthHeaders(),
        },
      });
      if (!resp.ok) throw new Error('Failed to load payments');
      const data = await resp.json();
      return data.payments || data || [];
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[PAYMENTS] API fetch failed, falling back to localDB in dev', e);
    }

    if (!businessId) return [];
    let list = localDB.getPayments?.() || localDB.getTableBookings?.() || [];

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(p => (p.status || '').toLowerCase() === filters.status.toLowerCase());
    }
    if (filters.mode && filters.mode !== 'ALL') {
      list = list.filter(p => (p.mode || p.payment_mode || 'UPI').toLowerCase() === filters.mode.toLowerCase());
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(p =>
        (p.payment_id && p.payment_id.toLowerCase().includes(q)) ||
        (p.order_id && p.order_id.toLowerCase().includes(q)) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(q)) ||
        (p.customer_phone && p.customer_phone.includes(q))
      );
    }
    if (filters.date_from) {
      list = list.filter(p => p.created_at && p.created_at >= filters.date_from);
    }
    if (filters.date_to) {
      list = list.filter(p => p.created_at && p.created_at <= filters.date_to + 'T23:59:59');
    }

    const sortBy = filters.sort_by || 'created_at';
    const sortDir = filters.sort_dir || 'desc';
    list.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    return list;
  },

  getPaymentById: async (paymentId) => {
    try {
      const resp = await fetch(`${API_BASE}/api/payments/upi/${encodeURIComponent(paymentId)}`, {
        headers: {
          'Accept': 'application/json',
          ...authStorage.getAuthHeaders(),
        },
      });
      if (!resp.ok) throw new Error('Payment not found');
      return await resp.json();
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      return null;
    }
  },

  createUpiPayment: async (data) => {
    try {
      const resp = await fetch(`${API_BASE}/api/payments/upi/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...authStorage.getAuthHeaders(),
        },
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to create UPI payment');
      }
      return await resp.json();
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      return { success: false, error: e.message };
    }
  },

  createSubscriptionPayment: async (data) => {
    try {
      const resp = await fetch(`${API_BASE}/api/payments/subscription/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...authStorage.getAuthHeaders(),
        },
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to create subscription payment');
      }
      return await resp.json();
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      return { success: false, error: e.message };
    }
  },
};