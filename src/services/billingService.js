import { getApiUrl, safeFetchJson } from '../config/api.js';
import { localDB, isProductionEnvironment } from './storageSeed.js';
import { notificationService, NOTIFICATION_TYPES } from './notificationService.js';
import { authStorage } from '../auth/authStorage.js';

export const billingService = {
  getInvoices: async (businessId, filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);
      const url = getApiUrl(`/api/billing/invoices?${params.toString()}`);
      const data = await safeFetchJson(url);
      if (data && Array.isArray(data.invoices)) {
        return data.invoices;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[BILLING] API fetch failed, falling back to localDB in dev', e);
    }

    if (!businessId) return [];
    let list = localDB.getInvoices().filter(i => i.business_id === businessId);

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(i => i.payment_status === filters.status);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(i =>
        (i.id && i.id.toLowerCase().includes(q)) ||
        (i.customer_name && i.customer_name.toLowerCase().includes(q)) ||
        (i.customer_phone && i.customer_phone.includes(q))
      );
    }

    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  createInvoice: async (data) => {
    try {
      const url = getApiUrl('/api/billing/invoices');
      const res = await safeFetchJson(url, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (res && res.invoice) {
        return res.invoice;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[BILLING] API createInvoice failed, falling back in dev', e);
    }

    const list = localDB.getInvoices();
    const newId = `INV-2026-${String(list.length + 101).padStart(3, '0')}`;

    const subtotal = Number(data.subtotal) || 0;
    const taxRate = Number(data.taxRate || 5);
    const tax_amount = Math.round((subtotal * taxRate) / 100);
    const discount_amount = Number(data.discount_amount || 0);
    const total_amount = Math.max(0, subtotal + tax_amount - discount_amount);

    const newInvoice = {
      id: newId,
      order_id: data.order_id || null,
      business_id: data.business_id || 'biz_1',
      customer_name: data.customer_name || 'Walk-in Customer',
      customer_phone: data.customer_phone || '+91 99999 00000',
      items: data.items || [],
      subtotal,
      tax_amount,
      discount_amount,
      total_amount,
      payment_status: data.payment_status || 'PAID',
      payment_mode: data.payment_mode || 'UPI',
      order_type: data.order_type || 'DINE_IN',
      table_id: data.table_id || null,
      table_number: data.table_number || null,
      due_date: data.due_date || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    };

    list.unshift(newInvoice);
    localDB.saveInvoices(list);
    return newInvoice;
  },

  updateInvoiceStatus: async (id, status) => {
    try {
      const url = getApiUrl(`/api/billing/invoices/${encodeURIComponent(id)}/status`);
      const res = await safeFetchJson(url, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (res && res.invoice) {
        return res.invoice;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[BILLING] API updateInvoiceStatus failed, falling back in dev', e);
    }

    const list = localDB.getInvoices();
    const idx = list.findIndex(i => i.id === id);
    if (idx !== -1) {
      const prevStatus = list[idx].payment_status;
      list[idx].payment_status = status;
      localDB.saveInvoices(list);

      if (status === 'PAID' && prevStatus !== 'PAID') {
        try {
          const inv = list[idx];
          const customers = localDB.getCustomers();
          const targetCust = customers.find(c => 
            (inv.customer_phone && c.phone === inv.customer_phone) ||
            (inv.customer_id && (c.id === inv.customer_id || c.customer_id === inv.customer_id))
          );
          if (targetCust) {
            const pointsToAward = Math.max(1, Math.floor(Number(inv.total_amount || 0) / 10));
            const newPoints = (targetCust.points || 0) + pointsToAward;
            const newSpent = (targetCust.total_spent || 0) + Number(inv.total_amount || 0);
            targetCust.points = newPoints;
            targetCust.total_spent = newSpent;
            localDB.saveCustomers(customers);

            try {
              const sUser = authStorage.getUser();
              if (sUser && (sUser.id === targetCust.id || sUser.phone === targetCust.phone)) {
                sUser.points = newPoints;
                sUser.total_spent = newSpent;
                authStorage.saveSession(authStorage.getToken(), sUser);
              }
            } catch (e) {}

            try {
              notificationService.createNotification({
                recipient_id: targetCust.customer_id || targetCust.id,
                business_id: inv.business_id,
                recipient_phone: targetCust.phone || inv.customer_phone,
                type: NOTIFICATION_TYPES.PAYMENT_CONFIRMED,
                title: 'Payment Confirmed & Points Credited!',
                message: `Your payment of ₹${inv.total_amount} was confirmed! You earned +${pointsToAward} loyalty points. Current points: ${newPoints}.`,
                entity_id: inv.id,
                action_url: '/customer/loyalty',
                send_sms: true,
              }).catch(() => {});
            } catch (_) {}
          }
        } catch (err) {
          console.error('[BILLING] Error crediting loyalty points on payment:', err);
        }
      }

      return list[idx];
    }
    throw new Error('Invoice not found');
  }
};
