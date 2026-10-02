import { localDB } from './storageSeed.js';
import { orderService } from './orderService.js';

export const adminService = {
  getPlatformStats: async () => {
    await new Promise(r => setTimeout(r, 200));
    const businesses = localDB.getBusinesses();
    const customers = localDB.getCustomers();
    const orderSummary = await orderService.getAdminOrderSummary();
    const plans = localDB.getPlans();

    const activeBusinesses = businesses.filter(b => b.status === 'APPROVED');
    const pendingBusinesses = businesses.filter(b => b.status === 'PENDING');
    const suspendedBusinesses = businesses.filter(b => b.status === 'SUSPENDED');

    const totalOrders = orderSummary.total_orders;
    const platformGMV = orderSummary.gross_merchandise_value;

    // Monthly subscription revenue calculation
    let monthlySaaSRevenue = 0;
    businesses.forEach(b => {
      const plan = plans.find(p => p.id === b.subscription_plan);
      if (plan) monthlySaaSRevenue += plan.price;
    });

    return {
      totalBusinesses: businesses.length,
      activeBusinesses: activeBusinesses.length,
      pendingBusinesses: pendingBusinesses.length,
      suspendedBusinesses: suspendedBusinesses.length,
      totalCustomers: customers.length,
      totalOrders,
      platformGMV,
      monthlySaaSRevenue,
      activeSubscriptions: activeBusinesses.length,
    };
  },

  getAllBusinesses: async (filters = {}) => {
    await new Promise(r => setTimeout(r, 150));
    let list = localDB.getBusinesses();

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(b => b.status === filters.status);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(b => 
        b.name.toLowerCase().includes(q) ||
        b.owner_name.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q)
      );
    }

    return list;
  },

  updateBusinessStatus: async (businessId, newStatus) => {
    await new Promise(r => setTimeout(r, 200));
    const list = localDB.getBusinesses();
    const idx = list.findIndex(b => b.id === businessId);
    if (idx !== -1) {
      list[idx].status = newStatus;
      localDB.saveBusinesses(list);
      return list[idx];
    }
    throw new Error('Business not found');
  },

  getPlans: async () => {
    return localDB.getPlans();
  },

  updatePlan: async (planId, updates) => {
    const plans = localDB.getPlans();
    const idx = plans.findIndex(p => p.id === planId);
    if (idx !== -1) {
      plans[idx] = { ...plans[idx], ...updates };
      localDB.savePlans(plans);
      return plans[idx];
    }
    throw new Error('Plan not found');
  }
};
