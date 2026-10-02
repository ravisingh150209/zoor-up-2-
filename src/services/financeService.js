import { getApiUrl, safeFetchJson } from '../config/api.js';
import { localDB, isProductionEnvironment } from './storageSeed.js';

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Salary',
  'Electricity',
  'Internet',
  'Supplies',
  'Marketing',
  'Delivery',
  'Other',
];

export const financeService = {
  getExpenses: async (businessId, filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.category && filters.category !== 'ALL') params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);
      const url = getApiUrl(`/api/finance/expenses?${params.toString()}`);
      const data = await safeFetchJson(url);
      if (data && Array.isArray(data.expenses)) {
        return data.expenses;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[FINANCE] API getExpenses failed, falling back to localDB in dev', e);
    }

    if (!businessId) return [];
    let list = localDB.getExpenses().filter(e => e.business_id === businessId);

    if (filters.category && filters.category !== 'ALL') {
      list = list.filter(e => e.category === filters.category);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(e => e.description && e.description.toLowerCase().includes(q));
    }

    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  addExpense: async (businessId, expenseData) => {
    try {
      const url = getApiUrl('/api/finance/expenses');
      const res = await safeFetchJson(url, {
        method: 'POST',
        body: JSON.stringify(expenseData)
      });
      if (res && res.expense) {
        return res.expense;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[FINANCE] API addExpense failed, falling back in dev', e);
    }

    const list = localDB.getExpenses();
    const newExpense = {
      id: `exp_${Date.now()}`,
      business_id: businessId,
      category: expenseData.category || 'Other',
      amount: Number(expenseData.amount),
      date: expenseData.date || new Date().toISOString().split('T')[0],
      description: expenseData.description || '',
      receipt: expenseData.receipt || null,
      created_at: new Date().toISOString(),
    };

    list.unshift(newExpense);
    localDB.saveExpenses(list);
    return newExpense;
  },

  deleteExpense: async (id) => {
    try {
      const url = getApiUrl(`/api/finance/expenses/${encodeURIComponent(id)}`);
      await safeFetchJson(url, { method: 'DELETE' });
      return true;
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[FINANCE] API deleteExpense failed, falling back in dev', e);
    }

    let list = localDB.getExpenses();
    list = list.filter(e => e.id !== id);
    localDB.saveExpenses(list);
    return true;
  },

  getSuppliers: async (businessId) => {
    try {
      const url = getApiUrl('/api/finance/suppliers');
      const data = await safeFetchJson(url);
      if (data && Array.isArray(data.suppliers)) {
        return data.suppliers;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[FINANCE] API getSuppliers failed, falling back to localDB in dev', e);
    }

    if (!businessId) return [];
    return localDB.getSuppliers().filter(s => s.business_id === businessId);
  },

  addSupplier: async (businessId, supplierData) => {
    try {
      const url = getApiUrl('/api/finance/suppliers');
      const res = await safeFetchJson(url, {
        method: 'POST',
        body: JSON.stringify(supplierData)
      });
      if (res && res.supplier) {
        return res.supplier;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[FINANCE] API addSupplier failed, falling back in dev', e);
    }

    const list = localDB.getSuppliers();
    const newSupplier = {
      id: `sup_${Date.now()}`,
      business_id: businessId,
      name: supplierData.name,
      phone: supplierData.phone,
      email: supplierData.email || '',
      address: supplierData.address || '',
      products: supplierData.products || '',
      outstanding_payment: Number(supplierData.outstanding_payment || 0),
    };
    list.unshift(newSupplier);
    localDB.saveSuppliers(list);
    return newSupplier;
  },

  deleteSupplier: async (id) => {
    try {
      const url = getApiUrl(`/api/finance/suppliers/${encodeURIComponent(id)}`);
      await safeFetchJson(url, { method: 'DELETE' });
      return true;
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[FINANCE] API deleteSupplier failed, falling back in dev', e);
    }

    let list = localDB.getSuppliers();
    list = list.filter(s => s.id !== id);
    localDB.saveSuppliers(list);
    return true;
  }
};
