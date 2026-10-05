import { authStorage } from '../auth/authStorage.js';
import { isProductionEnvironment } from './storageSeed.js';

import { API_BASE_URL as API_BASE } from '../config/api.js';

const request = async (path, options = {}) => {
  const headers = {
    Accept: 'application/json',
    ...authStorage.getAuthHeaders(),
    ...(options.headers || {}),
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.detail || `Order request failed with status ${response.status}`);
  }
  return data;
};

const getIdempotencyKey = (orderData) => {
  const signature = JSON.stringify({
    business_id: orderData.business_id,
    items: [...orderData.items].map(({ product_id, quantity }) => ({ product_id, quantity }))
      .sort((a, b) => a.product_id.localeCompare(b.product_id)),
    order_type: orderData.order_type,
    table_id: orderData.table_id || null,
    table_number: orderData.table_number || null,
    payment_method: orderData.payment_method,
  });

  if (typeof localStorage !== 'undefined') {
    try {
      const previous = JSON.parse(localStorage.getItem('zoorup_order_attempt') || 'null');
      if (previous?.signature === signature && previous?.key) return previous.key;
      const key = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('zoorup_order_attempt', JSON.stringify({ signature, key }));
      return key;
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

export const ORDER_STATUSES = {
  NEW: { label: 'New', color: 'info' },
  CONFIRMED: { label: 'Confirmed', color: 'info' },
  PREPARING: { label: 'Preparing', color: 'warning' },
  READY: { label: 'Ready for Pickup / Counter', color: 'warning' },
  COMPLETED: { label: 'Completed', color: 'success' },
  CANCELLED: { label: 'Cancelled', color: 'danger' },
};

export const orderService = {
  getOrders: async (businessId, filters = {}) => {
    if (!businessId) throw new Error('Business session is required to load orders.');
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    const suffix = params.size ? `?${params.toString()}` : '';
    return request(`/api/business/orders${suffix}`);
  },

  getCustomerOrders: async () => request('/api/orders/my'),

  getOrderById: async (orderId) => {
    if (!orderId) throw new Error('Order ID is required.');
    return request(`/api/orders/${encodeURIComponent(orderId)}`);
  },

  createOrder: async (orderData) => {
    const idempotencyKey = getIdempotencyKey(orderData);
    const order = await request('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        business_id: orderData.business_id,
        items: orderData.items.map((item) => ({
          product_id: item.product_id || item.id,
          quantity: Number(item.quantity),
        })),
        order_type: orderData.order_type,
        payment_method: orderData.payment_method,
        table_id: orderData.table_id || null,
        table_number: orderData.table_number || null,
        customer_name: orderData.customer_name || null,
        customer_phone: orderData.customer_phone || null,
        idempotency_key: idempotencyKey,
      }),
    });
    try {
      const previous = JSON.parse(localStorage.getItem('zoorup_order_attempt') || 'null');
      if (previous?.key === idempotencyKey) localStorage.removeItem('zoorup_order_attempt');
    } catch {}
    return order;
  },

  updateOrderStatus: async (orderId, orderStatus) => request(
    `/api/business/orders/${encodeURIComponent(orderId)}/status`,
    { method: 'PATCH', body: JSON.stringify({ status: orderStatus }) },
  ),

  getAdminOrderSummary: async () => request('/api/admin/orders/summary'),
};
