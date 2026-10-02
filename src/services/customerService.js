import { isProductionEnvironment, localDB } from './storageSeed.js';
import { authStorage } from '../auth/authStorage.js';
import { API_BASE_URL as API_BASE } from '../config/api.js';

export const calculateRank = (points) => {
  const pts = Number(points) || 0;
  if (pts >= 5000) return 'ADVANCE';
  if (pts >= 3000) return 'PLATINUM';
  if (pts >= 1500) return 'GOLD';
  if (pts >= 500) return 'SILVER';
  return 'BASIC';
};

export const customerService = {
  getCustomers: async (businessId, filters = {}) => {
    await new Promise(r => setTimeout(r, 100));
    if (!businessId) return [];
    if (isProductionEnvironment()) {
      const response = await fetch(`${API_BASE}/api/business/customers`, {
        headers: { ...authStorage.getAuthHeaders(), 'Accept': 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Unable to load connected customers.');
      let customers = (data.customers || []).map(customer => ({
        ...customer,
        rank: customer.rank || calculateRank(customer.points),
      }));
      if (filters.search) {
        const query = filters.search.toLowerCase();
        customers = customers.filter(customer =>
          [customer.name, customer.customer_id, customer.phone, customer.email]
            .some(value => String(value || '').toLowerCase().includes(query))
        );
      }
      if (filters.rank && filters.rank !== 'ALL') {
        customers = customers.filter(customer => customer.rank.toLowerCase() === filters.rank.toLowerCase());
      }
      return customers;
    }
    let list = localDB.getCustomers().filter(c => c.business_id === businessId);
    
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(c => 
        c.name.toLowerCase().includes(q) ||
        c.customer_id.toLowerCase().includes(q) ||
        c.phone.includes(q)
      );
    }

    if (filters.rank && filters.rank !== 'ALL') {
      list = list.filter(c => c.rank.toLowerCase() === filters.rank.toLowerCase());
    }

    return list;
  },

  getCustomerById: async (id) => {
    await new Promise(r => setTimeout(r, 150));
    if (isProductionEnvironment()) {
      const businessId = authStorage.getUser()?.business_id;
      const customers = await customerService.getCustomers(businessId);
      return customers.find(customer => customer.id === id || customer.customer_id === id) || null;
    }
    const list = localDB.getCustomers();
    return list.find(c => c.id === id || c.customer_id === id) || null;
  },

  addCustomer: async (businessId, customerData) => {
    await new Promise(r => setTimeout(r, 300));
    if (isProductionEnvironment()) {
      const email = (customerData.email || '').trim().toLowerCase();
      if (!email) throw new Error('A verified email is required to invite a customer.');
      const response = await fetch(`${API_BASE}/api/qr/invite/create`, {
        method: 'POST',
        headers: {
          ...authStorage.getAuthHeaders(),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ business_id: businessId, email, name: customerData.name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Customer invitation could not be created.');
      return { ...data, name: customerData.name, email, status: 'INVITED' };
    }
    const list = localDB.getCustomers();
    const count = list.length + 1;
    const customerId = `ZUP-CUS-${String(count).padStart(6, '0')}`;

    const points = Number(customerData.points) || 50; // Welcome points
    const newCustomer = {
      id: `cus_${Date.now()}`,
      customer_id: customerId,
      business_id: businessId,
      name: customerData.name,
      phone: customerData.phone,
      email: customerData.email || '',
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(customerData.name)}`,
      rank: calculateRank(points),
      points: points,
      wallet_balance: Number(customerData.wallet_balance) || 0,
      total_orders: 0,
      total_spent: 0,
      last_visit: new Date().toISOString(),
      joined_date: new Date().toISOString().split('T')[0],
      notes: customerData.notes || '',
    };

    list.unshift(newCustomer);
    localDB.saveCustomers(list);
    return newCustomer;
  },

  updateCustomer: async (id, updates) => {
    await new Promise(r => setTimeout(r, 200));
    if (isProductionEnvironment()) {
      if (updates.points === undefined || Object.keys(updates).some(key => key !== 'points')) {
        throw new Error('Only business-scoped points adjustments are supported for connected customers.');
      }
      const customer = await customerService.getCustomerById(id);
      if (!customer) throw new Error('Connected customer not found.');
      const pointsDelta = Number(updates.points) - Number(customer.points || 0);
      if (!pointsDelta) return customer;
      const response = await fetch(`${API_BASE}/api/business/customers/${encodeURIComponent(customer.customer_id)}/loyalty/adjust`, {
        method: 'POST',
        headers: {
          ...authStorage.getAuthHeaders(),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ points_delta: pointsDelta }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Points adjustment failed.');
      return { ...customer, points: data.points, rank: calculateRank(data.points) };
    }
    const list = localDB.getCustomers();
    const idx = list.findIndex(c => c.id === id || c.customer_id === id);
    if (idx !== -1) {
      if (updates.points !== undefined) {
        updates.rank = calculateRank(updates.points);
      }
      list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
      localDB.saveCustomers(list);
      return list[idx];
    }
    throw new Error('Customer not found');
  },

  deleteCustomer: async (id) => {
    await new Promise(r => setTimeout(r, 200));
    if (isProductionEnvironment()) {
      const customer = await customerService.getCustomerById(id);
      if (!customer) throw new Error('Connected customer not found.');
      const response = await fetch(`${API_BASE}/api/business/customers/${encodeURIComponent(customer.customer_id)}`, {
        method: 'DELETE',
        headers: authStorage.getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Customer could not be disconnected.');
      return true;
    }
    let list = localDB.getCustomers();
    list = list.filter(c => c.id !== id && c.customer_id !== id);
    localDB.saveCustomers(list);
    return true;
  },

  addPoints: async (customerId, addedPoints) => {
    const customer = await customerService.getCustomerById(customerId);
    if (customer) {
      const newPoints = (customer.points || 0) + Number(addedPoints);
      return await customerService.updateCustomer(customer.id, {
        points: newPoints,
      });
    }
    return null;
  },

  getProfile: async (user) => {
    if (!user) return null;

    // 1. Try Backend API
    const token = authStorage.getToken();
    if (token) {
      try {
        const resp = await fetch(`${API_BASE}/api/customer/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        if (resp.ok) {
          const apiData = await resp.json();
          if (apiData && apiData.customer_id) {
            return {
              ...apiData,
              points: Number(apiData.points || 0),
              stamps: Number(apiData.stamps || 0),
              total_visits: Number(apiData.total_visits || 0),
              lifetime_points: Number(apiData.lifetime_points || apiData.points || 0),
              joined_date: apiData.created_at?.split('T')[0] || '2026',
            };
          }
        }
      } catch (_) {}
    }

    if (isProductionEnvironment()) {
      throw new Error('Customer profile is unavailable from the backend.');
    }

    // 2. Local Fallback
    await new Promise(r => setTimeout(r, 60));
    const list = localDB.getCustomers();
    const cus = list.find(c => c.id === user.id || c.customer_id === user.customer_id || c.email === user.email || c.phone === user.phone);
    
    const profileImg = cus?.profile_image_url ?? user.profile_image_url ?? cus?.avatar ?? user.avatar ?? null;
    const pts = Number(cus?.points ?? user.points ?? 0);
    const tierName = calculateRank(pts);

    return {
      id: cus?.id || user.id,
      customer_id: cus?.customer_id || user.customer_id || (user.id ? `ZUP-CUS-${user.id.slice(-6).toUpperCase()}` : 'ZUP-CUS-NEW'),
      name: cus?.name || user.name || '',
      phone: cus?.phone || user.phone || '',
      email: cus?.email || user.email || '',
      points: pts,
      lifetime_points: Number(cus?.lifetime_points ?? user.lifetime_points ?? pts),
      total_visits: Number(cus?.total_visits ?? user.total_visits ?? 0),
      total_spent: Number(cus?.total_spent ?? user.total_spent ?? 0),
      stamps: Number(cus?.stamps ?? user.stamps ?? 0),
      segment: cus?.segment || user.segment || 'NEW',
      level_name: tierName,
      membership_tier: tierName,
      address: cus?.address || user.address || '',
      avatar: profileImg,
      profile_image_url: profileImg,
      joined_date: cus?.joined_date || user.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    };
  },

  updateProfile: async (user, updates) => {
    if (!user) throw new Error('Not authenticated');

    const normalizedUpdates = { ...updates };
    if ('profile_image_url' in updates || 'avatar' in updates) {
      const val = updates.profile_image_url !== undefined ? updates.profile_image_url : updates.avatar;
      normalizedUpdates.profile_image_url = val;
      normalizedUpdates.avatar = val;
    }

    let backendProfile = null;
    const token = authStorage.getToken();
    if (token) {
      try {
        const resp = await fetch(`${API_BASE}/api/customer/profile`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(normalizedUpdates)
        });
        if (resp.ok) {
          backendProfile = await resp.json();
        } else {
          const errData = await resp.json().catch(() => ({}));
          console.warn('Backend profile update failed:', errData.detail);
        }
      } catch (err) {
        console.warn('Backend profile update network error, falling back to local', err);
      }
    }

    if (isProductionEnvironment()) {
      if (!backendProfile) throw new Error('Customer profile could not be updated on the server.');
      const currentUser = authStorage.getUser();
      if (currentUser) {
        authStorage.saveSession(authStorage.getToken(), {
          ...currentUser,
          name: backendProfile.name,
          email: backendProfile.email,
          phone: backendProfile.phone,
        });
      }
      return backendProfile;
    }

    // 1. Update customer record if exists
    const list = localDB.getCustomers();
    const idx = list.findIndex(c => c.id === user.id || c.customer_id === user.customer_id || c.email === user.email);
    let updatedCus = null;
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...normalizedUpdates, ...(backendProfile || {}), updated_at: new Date().toISOString() };
      localDB.saveCustomers(list);
      updatedCus = list[idx];
    }

    // 2. Update user record in localDB users
    const users = localDB.getUsers();
    const userIdx = users.findIndex(u => u.id === user.id || u.email === user.email);
    if (userIdx !== -1) {
      users[userIdx] = { ...users[userIdx], ...normalizedUpdates, ...(backendProfile ? { name: backendProfile.name, email: backendProfile.email, phone: backendProfile.phone, address: backendProfile.address } : {}), updated_at: new Date().toISOString() };
      localDB.saveUsers(users);
    }

    // 3. Update session user in centralized authStorage
    try {
      const cur = authStorage.getUser();
      if (cur) {
        authStorage.saveSession(authStorage.getToken(), {
          ...cur,
          ...normalizedUpdates,
          ...(backendProfile ? { name: backendProfile.name, email: backendProfile.email, phone: backendProfile.phone } : {})
        });
      }
    } catch (e) {
      // Ignore in non-browser env
    }

    return backendProfile || {
      ...(updatedCus || user),
      ...normalizedUpdates
    };
  },

  getCustomerHome: async () => {
    const token = authStorage.getToken();
    if (token) {
      try {
        const resp = await fetch(`${API_BASE}/api/customer/home`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });
        if (resp.ok) {
          return await resp.json();
        }
      } catch (e) {
        console.warn('Failed to fetch customer home from backend:', e);
        if (isProductionEnvironment()) throw e;
      }
    }
    if (isProductionEnvironment()) throw new Error('Customer home is unavailable from the backend.');
    return null;
  },

  connectBusiness: async (businessId, source = 'qr_scan') => {
    const token = authStorage.getToken();
    if (token) {
      try {
        const resp = await fetch(`${API_BASE}/api/customer/businesses/connect`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ business_id: businessId, source })
        });
        if (resp.ok) {
          return await resp.json();
        }
      } catch (e) {
        console.warn('Failed to connect business:', e);
        if (isProductionEnvironment()) throw e;
      }
    }
    if (isProductionEnvironment()) throw new Error('Business connection could not be saved on the server.');
    return null;
  },

  recordVisit: async (businessId, customerId, visitData = {}) => {
    await new Promise(r => setTimeout(r, 200));
    if (isProductionEnvironment()) {
      const token = authStorage.getToken();
      if (!token) throw new Error('Please log in before checking in.');
      const response = await fetch(`${API_BASE}/api/customer/visits/checkin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ business_id: businessId, notes: visitData.notes || 'QR Code Check-in' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Check-in failed.');
      return {
        ...data,
        newPoints: data.points,
        newStamps: data.stamps,
        rewardUnlocked: data.reward_unlocked,
        alreadyCheckedInToday: false,
      };
    }
    const VISITS_KEY = 'zoorup_visits';
    let visits = [];
    try {
      const stored = localStorage.getItem(VISITS_KEY);
      if (stored) visits = JSON.parse(stored);
    } catch (e) {
      visits = [];
    }

    const targetCustId = visitData.customer_id || customerId;

    // Check for daily duplicate check-in (1 stamp per business per calendar day)
    const todayStr = new Date().toISOString().split('T')[0];
    const isTodayDuplicate = visits.some(v => 
      v.business_id === businessId && 
      (v.customer_id === customerId || v.customer_id === targetCustId) &&
      v.timestamp && v.timestamp.startsWith(todayStr)
    );

    if (isTodayDuplicate) {
      return {
        success: true,
        alreadyCheckedInToday: true,
        stamps_awarded: 0,
        points_awarded: 0,
        message: "You've already earned today's stamp. Come back tomorrow!",
      };
    }

    const pointsAwarded = Number(visitData.points !== undefined ? visitData.points : 50);
    const stampsAwarded = Number(visitData.stamps !== undefined ? visitData.stamps : 1);

    const newVisit = {
      id: `vis_${Date.now()}`,
      business_id: businessId,
      customer_id: customerId,
      customer_name: visitData.customer_name || 'Customer',
      timestamp: new Date().toISOString(),
      source: 'QR',
      points_awarded: pointsAwarded,
      stamps_awarded: stampsAwarded,
      notes: visitData.notes || 'QR Code Check-in'
    };

    visits.unshift(newVisit);
    try {
      localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
    } catch (e) {}

    // Calculate previous vs new points for level-up detection
    let prevPoints = 0;
    let newPoints = pointsAwarded;
    let newStamps = stampsAwarded;
    let newVisitsCount = 1;

    // Update customer stats in localDB
    const list = localDB.getCustomers();
    const idx = list.findIndex(c => 
      c.id === customerId || 
      c.customer_id === customerId || 
      c.id === targetCustId || 
      c.customer_id === targetCustId || 
      (customerId && customerId.startsWith('usr_') && c.id === customerId.slice(4))
    );
    if (idx !== -1) {
      const cur = list[idx];
      prevPoints = cur.points || 0;
      newPoints = prevPoints + pointsAwarded;
      newStamps = (cur.stamps || 0) + stampsAwarded;
      newVisitsCount = (cur.total_visits || 0) + 1;
      list[idx] = {
        ...cur,
        points: newPoints,
        lifetime_points: (cur.lifetime_points || cur.points || 0) + pointsAwarded,
        stamps: newStamps,
        total_visits: newVisitsCount,
        last_visit: new Date().toISOString(),
        rank: calculateRank(newPoints)
      };
      localDB.saveCustomers(list);
    }

    // Update user in users list
    const users = localDB.getUsers();
    const uIdx = users.findIndex(u => 
      u.id === customerId || 
      u.customer_id === customerId || 
      u.id === `usr_${customerId}` || 
      (targetCustId && (u.customer_id === targetCustId || u.id === targetCustId))
    );
    if (uIdx !== -1) {
      const curUser = users[uIdx];
      prevPoints = curUser.points || prevPoints;
      newPoints = (curUser.points || 0) + pointsAwarded;
      newStamps = (curUser.stamps || 0) + stampsAwarded;
      newVisitsCount = (curUser.total_visits || 0) + 1;
      users[uIdx] = {
        ...curUser,
        points: newPoints,
        lifetime_points: (curUser.lifetime_points || curUser.points || 0) + pointsAwarded,
        stamps: newStamps,
        total_visits: newVisitsCount,
        rank: calculateRank(newPoints)
      };
      localDB.saveUsers(users);

      try {
        const cur = authStorage.getUser();
        if (cur && (cur.id === curUser.id || cur.customer_id === curUser.customer_id)) {
          authStorage.saveSession(authStorage.getToken(), {
            ...cur,
            points: newPoints,
            stamps: newStamps,
            total_visits: newVisitsCount
          });
        }
      } catch (e) {}
    }

    // Evaluate Level-Up
    const prevTier = calculateRank(prevPoints);
    const newTier = calculateRank(newPoints);
    const levelUp = (prevTier !== newTier) ? { from: prevTier, to: newTier } : null;

    // Evaluate Reward Unlock (10 stamps or multiple of 10)
    const rewardUnlocked = (newStamps >= 10 && newStamps % 10 === 0) ? {
      title: 'Free Store Special Gift (₹150 Voucher)',
      stampsRequired: 10,
      rewardId: 'rew_stamp_10'
    } : null;

    return {
      success: true,
      visit: newVisit,
      points_awarded: pointsAwarded,
      stamps_awarded: stampsAwarded,
      newPoints,
      newStamps,
      newVisitsCount,
      levelUp,
      rewardUnlocked,
      alreadyCheckedInToday: false
    };
  },

  getVisits: async (customerId) => {
    await new Promise(r => setTimeout(r, 100));
    if (isProductionEnvironment()) {
      const home = await customerService.getCustomerHome();
      return home.visits || [];
    }
    const VISITS_KEY = 'zoorup_visits';
    try {
      const stored = localStorage.getItem(VISITS_KEY);
      if (stored) {
        const visits = JSON.parse(stored);
        if (!customerId) return visits;
        return visits.filter(v => v.customer_id === customerId);
      }
    } catch (e) {}
    return [];
  },

  // Business Owner Customer Insights & Automated Win-Back
  getCustomerInsights: async (businessId) => {
    await new Promise(r => setTimeout(r, 150));
    if (!businessId) return [];

    const customers = await customerService.getCustomers(businessId);
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // 1. Win-Back: Haven't visited in 30+ days
    const inactiveCustomers = customers.filter(c => {
      if (!c.last_visit) return false;
      const lastVisitTime = new Date(c.last_visit).getTime();
      return (now - lastVisitTime) >= thirtyDaysMs;
    });

    // 2. Close to reward (>= 8 stamps or within 200 points of next tier)
    const closeToRewardCustomers = customers.filter(c => {
      const stamps = c.stamps || 0;
      return (stamps >= 8 && stamps < 10) || (c.points >= 800 && c.points < 1000) || (c.points >= 2300 && c.points < 2500);
    });

    // 3. High value VIPs
    const vipCustomers = customers.filter(c => c.rank === 'VIP' || c.rank === 'Platinum' || (c.points || 0) >= 2500);

    return [
      {
        id: 'win_back',
        type: 'WIN_BACK',
        title: 'Win-Back Reminders',
        count: inactiveCustomers.length,
        description: `${inactiveCustomers.length} customer${inactiveCustomers.length === 1 ? '' : 's'} haven't visited in 30+ days.`,
        actionLabel: 'Create Win-Back Offer',
        customers: inactiveCustomers,
      },
      {
        id: 'close_to_reward',
        type: 'REWARD_PROGRESS',
        title: 'Close to Reward',
        count: closeToRewardCustomers.length,
        description: `${closeToRewardCustomers.length} customer${closeToRewardCustomers.length === 1 ? '' : 's'} are close to unlocking a reward (8+ stamps).`,
        actionLabel: 'Send Progress Reminder',
        customers: closeToRewardCustomers,
      },
      {
        id: 'vip_retention',
        type: 'VIP_LOYALTY',
        title: 'VIP Club Members',
        count: vipCustomers.length,
        description: `${vipCustomers.length} top-tier customer${vipCustomers.length === 1 ? '' : 's'} driving high repeat orders.`,
        actionLabel: 'View VIP Customers',
        customers: vipCustomers,
      }
    ];
  }
};
