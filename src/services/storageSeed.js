// Unified Local Store & Persistence Layer for ZOOR UP (Clean Production Data)

export const DEFAULT_PLANS = [
  {
    id: 'FREE',
    name: 'Free',
    price: 0,
    interval: 'month',
    customerLimit: 50,
    staffLimit: 1,
    features: ['Basic Business Management', 'Up to 50 Customers', 'Digital QR Menu', 'Standard Dashboard', 'Table Booking'],
    recommended: false,
  },
  {
    id: 'STARTER',
    name: 'Starter',
    price: 299,
    interval: 'month',
    customerLimit: 250,
    staffLimit: 3,
    features: ['Up to 250 Customers', 'Loyalty & Reward Points', 'QR Menu & Catalog', 'Basic Analytics', 'Table Booking System', 'Up to 3 Staff Accounts'],
    recommended: false,
  },
  {
    id: 'GROWTH',
    name: 'Growth',
    price: 799,
    interval: 'month',
    customerLimit: 1000,
    staffLimit: 10,
    features: ['Advanced Analytics', 'Full Inventory Management', 'Staff Roles & Permissions', 'Billing & POS Invoices', 'Customer CRM & History', 'Table Reservation Management', 'WhatsApp Notifications'],
    recommended: true,
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 1499,
    interval: 'month',
    customerLimit: 100000,
    staffLimit: 50,
    features: ['Unlimited Customers', 'Custom Domain / QR Branding', 'Automated Customer Campaigns', 'Table & Seating Optimization', 'Full Financial & Tax Invoices', 'Dedicated Support'],
    recommended: false,
  },
  {
    id: 'PREMIUM',
    name: 'Premium',
    price: 2499,
    interval: 'month',
    customerLimit: 500000,
    staffLimit: 100,
    features: ['Everything in Pro', 'Unlimited Customers & Staff', 'Custom Domain & White-Label Branding', 'Multi-Location Sync', 'Automated Marketing & WhatsApp Campaigns', 'Dedicated Account Manager & 24/7 SLA'],
    recommended: false,
  }
];

// Helper to initialize or retrieve from localStorage
const getStored = (key, fallback = []) => {
  if (isProductionEnvironment() && key !== 'plans') {
    throw new Error(`Local-only ${key} data is disabled in production; use the FastAPI service.`);
  }
  if (isProductionEnvironment() && key === 'plans') return fallback;
  try {
    const data = localStorage.getItem(`zoorup_${key}`);
    if (data !== null) {
      return JSON.parse(data);
    }
    return fallback;
  } catch {
    return fallback;
  }
};

const setStored = (key, val) => {
  if (isProductionEnvironment()) {
    throw new Error(`Local-only ${key} writes are disabled in production; use the FastAPI service.`);
  }
  try {
    localStorage.setItem(`zoorup_${key}`, JSON.stringify(val));
  } catch (e) {
    console.error(`Failed to persist ${key} in localStorage`, e);
  }
};

export const localDB = {
  // Generic key-value store access
  getStored: (key, fallback = []) => getStored(key, fallback),
  setStored: (key, val) => setStored(key, val),

  // Real Database Collections — Pure empty data defaults (No fake records)
  getUsers: () => getStored('users', []),
  saveUsers: (data) => setStored('users', data),

  getBusinesses: () => getStored('businesses', []),
  saveBusinesses: (data) => setStored('businesses', data),

  getCustomers: () => getStored('customers', []),
  saveCustomers: (data) => setStored('customers', data),

  getProducts: () => getStored('products', []),
  saveProducts: (data) => setStored('products', data),

  getStaff: () => getStored('staff', []),
  saveStaff: (data) => setStored('staff', data),

  getInvoices: () => getStored('invoices', []),
  saveInvoices: (data) => setStored('invoices', data),

  getExpenses: () => getStored('expenses', []),
  saveExpenses: (data) => setStored('expenses', data),

  getSuppliers: () => getStored('suppliers', []),
  saveSuppliers: (data) => setStored('suppliers', data),

  getOffers: () => getStored('offers', []),
  saveOffers: (data) => setStored('offers', data),

  getMessages: () => getStored('messages', []),
  saveMessages: (data) => setStored('messages', data),

  getNotifications: () => getStored('notifications', []),
  saveNotifications: (data) => setStored('notifications', data),

  getPlans: () => isProductionEnvironment() ? DEFAULT_PLANS : getStored('plans', DEFAULT_PLANS),
  savePlans: (data) => setStored('plans', data),

  getSubscriptions: () => getStored('subscriptions', []),
  saveSubscriptions: (data) => setStored('subscriptions', data),

  getRewards: () => getStored('rewards', []),
  saveRewards: (data) => setStored('rewards', data),

  getPayments: () => getStored('payments', []),
  savePayments: (data) => setStored('payments', data),

  // Table Booking System Collections
  getTables: () => getStored('tables', []),
  saveTables: (data) => setStored('tables', data),

  getTableSettings: () => getStored('table_settings', []),
  saveTableSettings: (data) => setStored('table_settings', data),

  getTableBookings: () => getStored('table_bookings', []),
  saveTableBookings: (data) => setStored('table_bookings', data),

  // Clear all storage for pristine testing / clean logout
  clearAll: () => {
    try {
      const keys = [
        'users', 'businesses', 'customers', 'products', 'staff',
        'invoices', 'expenses', 'suppliers', 'offers', 'messages', 'notifications',
        'subscriptions', 'rewards', 'tables', 'table_settings', 'table_bookings',
        'visits', 'claimed_rewards'
      ];
      keys.forEach(k => localStorage.removeItem(`zoorup_${k}`));
    } catch (_) {}
  },

  isProduction: () => isProductionEnvironment()
};

if (typeof localStorage !== 'undefined') {
  try {
    localStorage.removeItem('zoorup_orders');
  } catch {}
}

export const isProductionEnvironment = () => {
  if (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'production' || process.env?.ENVIRONMENT === 'production')) return true;
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) return true;
  if (typeof window !== 'undefined') {
    return window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  }
  return false;
};

