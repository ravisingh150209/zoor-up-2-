import { getApiUrl, safeFetchJson } from '../config/api.js';
import { localDB, isProductionEnvironment } from './storageSeed.js';

export const ALL_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard Overview', desc: 'View summary KPIs & metrics' },
  { key: 'customers', label: 'Customer Management', desc: 'Add, view & edit customers' },
  { key: 'orders', label: 'Order Processing', desc: 'Accept, prepare & dispatch orders' },
  { key: 'products', label: 'Products & Services', desc: 'Create & manage catalog items' },
  { key: 'billing', label: 'Billing & POS Invoices', desc: 'Generate invoices & take payments' },
  { key: 'inventory', label: 'Inventory Control', desc: 'Adjust stock levels and logs' },
  { key: 'delivery', label: 'Delivery Coordination', desc: 'Assign riders & track dropoffs' },
  { key: 'chat', label: 'Customer Chat', desc: 'Reply to customer messages' },
  { key: 'reports', label: 'Reports & Export', desc: 'Export sales and inventory sheets' },
];

export const staffService = {
  getStaffMembers: async (businessId) => {
    try {
      const url = getApiUrl('/api/business/staff');
      const data = await safeFetchJson(url);
      if (data && Array.isArray(data.staff)) {
        return data.staff;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[STAFF] API getStaffMembers failed, falling back to localDB in dev', e);
    }

    if (!businessId) return [];
    return localDB.getStaff().filter(s => s.business_id === businessId);
  },

  addStaff: async (businessId, staffData) => {
    try {
      const url = getApiUrl('/api/business/staff');
      const res = await safeFetchJson(url, {
        method: 'POST',
        body: JSON.stringify(staffData)
      });
      if (res && res.staff) {
        return res.staff;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[STAFF] API addStaff failed, falling back in dev', e);
    }

    const list = localDB.getStaff();
    const photo = staffData.profile_image_url || staffData.avatar || null;
    const newStaff = {
      id: `stf_${Date.now()}`,
      business_id: businessId,
      name: staffData.name,
      role: staffData.role || 'Staff Member',
      email: staffData.email,
      phone: staffData.phone,
      profile_image_url: photo,
      avatar: photo,
      status: 'ACTIVE',
      permissions: staffData.permissions || ['dashboard', 'orders', 'billing'],
      joined_date: new Date().toISOString().split('T')[0],
    };
    list.unshift(newStaff);
    localDB.saveStaff(list);
    return newStaff;
  },

  updateStaff: async (id, updates, callerContext = null) => {
    try {
      const url = getApiUrl(`/api/business/staff/${encodeURIComponent(id)}`);
      const res = await safeFetchJson(url, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      if (res && res.staff) {
        return res.staff;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[STAFF] API updateStaff failed, falling back in dev', e);
    }

    const list = localDB.getStaff();
    const idx = list.findIndex(s => s.id === id);
    if (idx !== -1) {
      if (callerContext?.callerBusinessId && callerContext.callerBusinessId !== list[idx].business_id) {
        throw new Error(`Unauthorized: Business ${callerContext.callerBusinessId} cannot modify staff in Business ${list[idx].business_id}`);
      }
      const finalUpdates = { ...updates };
      if (finalUpdates.profile_image_url !== undefined) {
        finalUpdates.avatar = finalUpdates.profile_image_url;
      } else if (finalUpdates.avatar !== undefined) {
        finalUpdates.profile_image_url = finalUpdates.avatar;
      }
      list[idx] = { ...list[idx], ...finalUpdates };
      localDB.saveStaff(list);
      return list[idx];
    }
    throw new Error('Staff member not found');
  },

  toggleStaffStatus: async (id) => {
    const list = localDB.getStaff();
    const idx = list.findIndex(s => s.id === id);
    if (idx !== -1) {
      const newStatus = list[idx].status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      try {
        const url = getApiUrl(`/api/business/staff/${encodeURIComponent(id)}`);
        const res = await safeFetchJson(url, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus })
        });
        if (res && res.staff) {
          list[idx] = res.staff;
          localDB.saveStaff(list);
          return res.staff;
        }
      } catch (e) {
        if (isProductionEnvironment()) throw e;
        console.warn('[STAFF] API toggleStatus failed, falling back in dev', e);
      }
      list[idx].status = newStatus;
      localDB.saveStaff(list);
      return list[idx];
    }
    throw new Error('Staff member not found');
  },

  deleteStaff: async (id) => {
    try {
      const url = getApiUrl(`/api/business/staff/${encodeURIComponent(id)}`);
      await safeFetchJson(url, { method: 'DELETE' });
      return true;
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[STAFF] API deleteStaff failed, falling back in dev', e);
    }

    let list = localDB.getStaff();
    list = list.filter(s => s.id !== id);
    localDB.saveStaff(list);
    return true;
  }
};
