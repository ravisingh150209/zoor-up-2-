import { isProductionEnvironment, localDB } from './storageSeed.js';
import { orderService } from './orderService.js';
import { authStorage } from '../auth/authStorage.js';
import { API_BASE_URL as API_BASE } from '../config/api.js';

export const businessService = {
  // GET /api/business/profile or by ID
  getBusiness: async (id) => {
    if (!id) return null;
    try {
      const resp = await fetch(`${API_BASE}/api/public/menu/${encodeURIComponent(id)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.business) {
          if (!isProductionEnvironment()) {
            const list = localDB.getBusinesses();
            const idx = list.findIndex(b => b.id === data.business.id);
            if (idx !== -1) list[idx] = { ...list[idx], ...data.business };
            else list.push(data.business);
            localDB.saveBusinesses(list);
          }
          return data.business;
        }
        if (resp.status === 404) return null;
        if (isProductionEnvironment()) throw new Error('Unable to load this business from the server.');
      }
    } catch (error) {
      if (isProductionEnvironment()) throw error;
    }

    if (isProductionEnvironment()) return null;
    const list = localDB.getBusinesses();
    const found = list.find(b => b.id === id);
    return found || null;
  },

  getBusinessProfile: async (id) => {
    return businessService.getBusiness(id);
  },

  getBusinessBySlug: async (slug) => {
    if (!slug) return null;
    try {
      const resp = await fetch(`${API_BASE}/api/public/menu/${encodeURIComponent(slug)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.business) {
          if (!isProductionEnvironment()) {
            const list = localDB.getBusinesses();
            const idx = list.findIndex(b => b.id === data.business.id || b.slug === data.business.slug);
            if (idx !== -1) list[idx] = { ...list[idx], ...data.business };
            else list.push(data.business);
            localDB.saveBusinesses(list);
          }
          return data.business;
        }
        if (resp.status === 404) return null;
        if (isProductionEnvironment()) throw new Error('Unable to load this business from the server.');
      }
    } catch (error) {
      if (isProductionEnvironment()) throw error;
    }

    if (isProductionEnvironment()) return null;
    const list = localDB.getBusinesses();
    return list.find(b => b.slug === slug || b.id === slug) || null;
  },

  getAllBusinesses: async (filters = {}) => {
    let list = [];
    try {
      const resp = await fetch(`${API_BASE}/api/public/businesses`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!resp.ok) throw new Error('Business directory is unavailable from the server.');
      if (resp.ok) {
        const apiBusinesses = await resp.json();
        if (Array.isArray(apiBusinesses)) {
          list = apiBusinesses;
          if (!isProductionEnvironment()) {
            const localList = localDB.getBusinesses();
            const merged = [...list];
            for (const lb of localList) {
              if (!merged.some(m => m.id === lb.id)) merged.push(lb);
            }
            localDB.saveBusinesses(merged);
          }
        } else if (isProductionEnvironment()) {
          throw new Error('Business directory returned an invalid response.');
        }
      }
    } catch (error) {
      if (isProductionEnvironment()) throw error;
    }

    if (list.length === 0 && !isProductionEnvironment()) {
      list = localDB.getBusinesses();
    }

    if (filters.category && filters.category !== 'All') {
      list = list.filter(b => b.category && b.category.toLowerCase().includes(filters.category.toLowerCase()));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(b => (b.name && b.name.toLowerCase().includes(q)) || (b.city && b.city.toLowerCase().includes(q)));
    }
    if (filters.status) {
      list = list.filter(b => b.status === filters.status);
    }
    return list;
  },

  // PUT /api/business/profile
  updateBusiness: async (id, updates, callerContext = null) => {
    await new Promise(r => setTimeout(r, 200));
    if (!id) throw new Error('Business ID is required');

    if (isProductionEnvironment()) {
      if (callerContext?.callerBusinessId && callerContext.callerBusinessId !== id) {
        throw new Error('You can only update your authenticated business.');
      }
      const response = await fetch(`${API_BASE}/api/business/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...authStorage.getAuthHeaders(),
        },
        body: JSON.stringify(updates),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Business update failed.');
      if (result.id !== id) throw new Error('The server returned a different business account.');
      return result;
    }

    const list = localDB.getBusinesses();
    const idx = list.findIndex(b => b.id === id);
    if (idx !== -1) {
      const currentBiz = list[idx];

      // Strict Cross-Tenant Security Check
      if (callerContext) {
        const { callerBusinessId, callerUserId } = callerContext;
        if (callerBusinessId && callerBusinessId !== id) {
          throw new Error(`Unauthorized: Business ${callerBusinessId} cannot modify Business ${id} data.`);
        }
        if (callerUserId && callerUserId !== currentBiz.owner_id && callerBusinessId !== id) {
          throw new Error('Unauthorized: User does not own this business.');
        }
      }

      // Sync logo_url / logo
      let finalUpdates = { ...updates };
      if (finalUpdates.logo_url !== undefined) {
        finalUpdates.logo = finalUpdates.logo_url;
      } else if (finalUpdates.logo !== undefined) {
        finalUpdates.logo_url = finalUpdates.logo;
      }

      // Sync cover_photo_url / cover_image
      if (finalUpdates.cover_photo_url !== undefined) {
        finalUpdates.cover_image = finalUpdates.cover_photo_url;
      } else if (finalUpdates.cover_image !== undefined) {
        finalUpdates.cover_photo_url = finalUpdates.cover_image;
      }

      // Enforce Gallery Plan Limits
      if (finalUpdates.gallery !== undefined && Array.isArray(finalUpdates.gallery)) {
        const plan = (currentBiz.subscription_plan || 'FREE').toUpperCase();
        const limits = { PRO: 50, PREMIUM: 50, GROWTH: 15, STARTER: 5, BASIC: 5, FREE: 2 };
        const maxAllowed = limits[plan] || 2;
        if (finalUpdates.gallery.length > maxAllowed) {
          throw new Error(`Plan ${plan} allows up to ${maxAllowed} gallery images. You submitted ${finalUpdates.gallery.length}.`);
        }
        // Normalize gallery items with position
        finalUpdates.gallery = finalUpdates.gallery.map((item, idx) => ({
          url: typeof item === 'string' ? item : item.url,
          position: typeof item === 'object' && item.position !== undefined ? item.position : idx,
        }));
      }

      const updatedBiz = {
        ...currentBiz,
        ...finalUpdates,
        updated_at: new Date().toISOString(),
      };
      list[idx] = updatedBiz;
      localDB.saveBusinesses(list);

      // If owner name or phone was updated, keep owner user in sync
      if (finalUpdates.owner_name || finalUpdates.phone) {
        const users = localDB.getUsers();
        const userIdx = users.findIndex(u => u.id === updatedBiz.owner_id || u.business_id === id);
        if (userIdx !== -1) {
          if (finalUpdates.owner_name) users[userIdx].name = finalUpdates.owner_name;
          if (finalUpdates.phone) users[userIdx].phone = finalUpdates.phone;
          users[userIdx].updated_at = new Date().toISOString();
          localDB.saveUsers(users);
        }
      }

      return updatedBiz;
    }
    throw new Error('Business not found');
  },

  updateBusinessProfile: async (id, updates, callerContext = null) => {
    return businessService.updateBusiness(id, updates, callerContext);
  },

  // Get Store Gallery
  getStoreGallery: async (businessId) => {
    const biz = await businessService.getBusiness(businessId);
    return Array.isArray(biz?.gallery) ? biz.gallery : [];
  },

  // Update Store Gallery
  updateStoreGallery: async (businessId, galleryItems, callerContext = null) => {
    return businessService.updateBusiness(businessId, { gallery: galleryItems }, callerContext);
  },

  // PUT /api/onboarding/business - Immediate step persistence
  saveOnboardingStep: async (businessId, stepNumber, stepData) => {
    await new Promise(r => setTimeout(r, 150));
    if (isProductionEnvironment()) {
      const response = await fetch(`${API_BASE}/api/onboarding/step`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...authStorage.getAuthHeaders(),
        },
        body: JSON.stringify({ step: stepNumber, data: stepData }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Business onboarding save failed.');
      if (result.business?.id !== businessId) throw new Error('The server returned a different business account.');
      return result.business;
    }
    const list = localDB.getBusinesses();
    const idx = list.findIndex(b => b.id === businessId);
    if (idx !== -1) {
      const current = list[idx];
      const updated = {
        ...current,
        ...stepData,
        last_onboarding_step: stepNumber,
        updated_at: new Date().toISOString(),
      };
      if (stepNumber >= 10) {
        updated.onboarding_completed = true;
      }
      list[idx] = updated;
      localDB.saveBusinesses(list);

      // Also update user record if business name or owner name modified
      const users = localDB.getUsers();
      const uIdx = users.findIndex(u => u.business_id === businessId || u.id === current.owner_id);
      if (uIdx !== -1) {
        if (stepData.name) users[uIdx].business_name = stepData.name;
        if (stepData.owner_name) users[uIdx].name = stepData.owner_name;
        if (stepData.phone) users[uIdx].phone = stepData.phone;
        localDB.saveUsers(users);
      }

      return updated;
    }
    throw new Error('Business not found');
  },

  completeOnboarding: async (businessId) => {
    if (isProductionEnvironment()) {
      return businessService.saveOnboardingStep(businessId, 10, { onboarding_completed: true });
    }
    return businessService.updateBusiness(businessId, { onboarding_completed: true });
  },

  getDashboardStats: async (businessId) => {
    await new Promise(r => setTimeout(r, 150));
    if (!businessId) {
      return {
        business: null,
        stats: {
          todaySales: 0,
          todayOrdersCount: 0,
          totalCustomers: 0,
          newCustomers: 0,
          pendingOrders: 0,
          completedOrders: 0,
          lowStockCount: 0,
          totalRevenue: 0,
          totalExpense: 0,
          netProfit: 0,
          totalPointsIssued: 0,
          activeOffersCount: 0,
          subscriptionPlan: 'FREE',
        },
        charts: {
          salesChart: [
            { day: 'Mon', sales: 0, orders: 0 },
            { day: 'Tue', sales: 0, orders: 0 },
            { day: 'Wed', sales: 0, orders: 0 },
            { day: 'Thu', sales: 0, orders: 0 },
            { day: 'Fri', sales: 0, orders: 0 },
            { day: 'Sat', sales: 0, orders: 0 },
            { day: 'Sun', sales: 0, orders: 0 },
          ],
          categoryDistribution: [],
        },
      };
    }

    if (isProductionEnvironment()) {
      const response = await fetch(`${API_BASE}/api/business/dashboard`, {
        headers: { ...authStorage.getAuthHeaders(), 'Accept': 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Dashboard data is unavailable from the server.');
      return data;
    }

    const business = await businessService.getBusiness(businessId);
    // STRICT TENANT ISOLATION: filter records by business_id only
    const orders = await orderService.getOrders(businessId);
    const customers = localDB.getCustomers().filter(c => c.business_id === businessId);
    const products = localDB.getProducts().filter(p => p.business_id === businessId);
    const expenses = localDB.getExpenses().filter(e => e.business_id === businessId);
    const offers = localDB.getOffers().filter(o => o.business_id === businessId);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.created_at && o.created_at.startsWith(todayStr));
    const todaySales = todayOrders.reduce((sum, o) => sum + (o.payment_status === 'PAID' ? (Number(o.total) || 0) : 0), 0);
    const totalRevenue = orders.reduce((sum, o) => sum + (o.payment_status === 'PAID' ? (Number(o.total) || 0) : 0), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netProfit = Math.max(0, totalRevenue - totalExpense);

    const pendingOrders = orders.filter(o => ['NEW', 'CONFIRMED', 'PREPARING'].includes(o.status)).length;
    const completedOrders = orders.filter(o => o.status === 'COMPLETED' || o.status === 'DELIVERED').length;
    const lowStockCount = products.filter(p => p.type === 'product' && p.stock <= 5).length;
    const totalPointsIssued = customers.reduce((sum, c) => sum + (c.points || 0), 0);

    // Dynamic Chart Data: computed strictly from real orders
    const dayMap = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
    const chartMap = { Mon: { sales: 0, orders: 0 }, Tue: { sales: 0, orders: 0 }, Wed: { sales: 0, orders: 0 }, Thu: { sales: 0, orders: 0 }, Fri: { sales: 0, orders: 0 }, Sat: { sales: 0, orders: 0 }, Sun: { sales: 0, orders: 0 } };

    orders.forEach(o => {
      const d = new Date(o.created_at);
      const dayName = dayMap[d.getDay()] || 'Mon';
      if (chartMap[dayName]) {
        chartMap[dayName].orders += 1;
        if (o.payment_status === 'PAID') {
          chartMap[dayName].sales += Number(o.total) || 0;
        }
      }
    });

    const salesChart = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      sales: chartMap[day].sales,
      orders: chartMap[day].orders,
    }));

    // Category distribution strictly computed from this business's products
    let categoryDistribution = [];
    if (products.length > 0) {
      const counts = {};
      products.forEach(p => {
        const cat = p.category || 'General';
        counts[cat] = (counts[cat] || 0) + 1;
      });
      const colors = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'];
      categoryDistribution = Object.keys(counts).map((cat, i) => ({
        name: cat,
        percentage: Math.round((counts[cat] / products.length) * 100),
        color: colors[i % colors.length],
      }));
    }

    return {
      business: business || {
        id: businessId,
        name: '',
        owner_name: '',
        status: 'ACTIVE',
        subscription_plan: 'FREE',
      },
      stats: {
        todaySales,
        todayOrdersCount: todayOrders.length,
        totalCustomers: customers.length,
        newCustomers: customers.filter(c => c.joined_date >= '2026-09-01').length,
        pendingOrders,
        completedOrders,
        lowStockCount,
        totalRevenue,
        totalExpense,
        netProfit,
        totalPointsIssued,
        activeOffersCount: offers.filter(o => o.active).length,
        subscriptionPlan: business?.subscription_plan || 'FREE',
      },
      charts: {
        salesChart,
        categoryDistribution,
      }
    };
  },

  // UPI & Payments Setup
  getUpiSettings: async (businessId) => {
    await new Promise(r => setTimeout(r, 100));
    const biz = await businessService.getBusiness(businessId);
    return {
      upi_id: biz?.upi_id || '',
      upi_name: biz?.upi_name || biz?.name || '',
      upi_notes: biz?.upi_notes || 'ZOOR UP Store Payment',
      upi_enabled: Boolean(biz?.upi_id),
    };
  },

  saveUpiSettings: async (businessId, settings) => {
    await new Promise(r => setTimeout(r, 200));
    const upiId = (settings.upi_id || '').trim();
    if (upiId) {
      // Basic format check: name@provider
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!upiRegex.test(upiId)) {
        throw new Error('Please enter a valid UPI ID (e.g. yourstore@okaxis, business@upi)');
      }
    }

    const updates = {
      upi_id: upiId,
      upi_name: (settings.upi_name || '').trim(),
      upi_notes: (settings.upi_notes || '').trim(),
      upi_enabled: Boolean(upiId),
      updated_at: new Date().toISOString()
    };

    await businessService.updateBusiness(businessId, updates);
    return updates;
  },

  generateUpiPaymentUrl: ({ upi_id, upi_name, amount, note }) => {
    if (!upi_id) return null;
    const cleanId = upi_id.trim();
    const cleanName = encodeURIComponent(upi_name || 'Store Payment');
    const cleanNote = encodeURIComponent(note || 'ZOOR UP Order');
    const amtStr = amount ? `&am=${encodeURIComponent(Number(amount).toFixed(2))}` : '';
    return `upi://pay?pa=${cleanId}&pn=${cleanName}${amtStr}&tn=${cleanNote}&cu=INR`;
  }
};
