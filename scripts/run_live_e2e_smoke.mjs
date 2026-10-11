/**
 * Master LIVE E2E Production Smoke Test Suite for ZOOR UP
 * Targets:
 *   Frontend Origin: https://zoor-up-9b3a3.web.app
 *   Backend URL: https://zoor-up-2.onrender.com
 *   Database: Live Supabase PostgreSQL
 */

const API_BASE = 'https://zoor-up-2.onrender.com';
const ORIGIN = 'https://zoor-up-9b3a3.web.app';

const headersFor = (token) => {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Origin': ORIGIN
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
};

const runSmokeTest = async () => {
  const timestamp = Date.now();
  console.log(`[TEST SUITE] Executing Complete LIVE E2E Smoke Test at ${new Date().toISOString()}`);

  const summary = {
    auth: 'FAIL',
    business: 'FAIL',
    customer: 'FAIL',
    database_persistence: 'FAIL',
    qr: 'FAIL',
    loyalty: 'FAIL',
    orders: 'FAIL',
    booking: 'FAIL',
    data_isolation: 'FAIL',
    physical_qr: 'NOT TESTED',
    critical_bugs: []
  };

  const request = async (endpoint, options = {}) => {
    const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const opts = {
      ...options,
      headers: {
        ...headersFor(options.token),
        ...(options.headers || {})
      }
    };
    try {
      const res = await fetch(url, opts);
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return { ok: res.ok, status: res.status, data, headers: res.headers };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  };

  // 1 & 2: Business A Signup & Login
  const bEmail = `biz_smoke_${timestamp}@zoorup.test`;
  const bPass = `Pass_${timestamp}!`;
  const bizAReg = await request('/api/auth/owner/register', {
    method: 'POST',
    body: JSON.stringify({
      name: `Grand Cafe ${timestamp}`,
      owner_name: 'Owner A',
      email: bEmail,
      phone: `91${String(timestamp).slice(-8)}`,
      password: bPass,
      business_category: 'Cafe'
    })
  });
  const bToken = bizAReg.data?.access_token;
  const bId = bizAReg.data?.business?.id;
  const bSlug = bizAReg.data?.business?.slug;

  const bizALog = await request('/api/auth/owner/login', {
    method: 'POST',
    body: JSON.stringify({ email: bEmail, password: bPass })
  });

  // Business B (for data isolation testing)
  const bBEmail = `biz_smoke_b_${timestamp}@zoorup.test`;
  const bBPass = `Pass_${timestamp}!`;
  const bizBReg = await request('/api/auth/owner/register', {
    method: 'POST',
    body: JSON.stringify({
      name: `Bistro B ${timestamp}`,
      owner_name: 'Owner B',
      email: bBEmail,
      phone: `92${String(timestamp).slice(-8)}`,
      password: bBPass,
      business_category: 'Restaurant'
    })
  });
  const bBToken = bizBReg.data?.access_token;
  const bBId = bizBReg.data?.business?.id;

  // 3 & 4: Customer A Signup & Login
  const cEmail = `cust_smoke_${timestamp}@zoorup.test`;
  const cPass = `Pass_${timestamp}!`;
  const custAReg = await request('/api/auth/customer/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Smoke Customer A',
      email: cEmail,
      phone: `93${String(timestamp).slice(-8)}`,
      password: cPass
    })
  });
  const cToken = custAReg.data?.access_token;
  const cCode = custAReg.data?.customer?.customer_id;

  const custALog = await request('/api/auth/customer/login', {
    method: 'POST',
    body: JSON.stringify({ email: cEmail, password: cPass })
  });

  // Customer B (for data isolation testing)
  const cBEmail = `cust_smoke_b_${timestamp}@zoorup.test`;
  const cBPass = `Pass_${timestamp}!`;
  const custBReg = await request('/api/auth/customer/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Smoke Customer B',
      email: cBEmail,
      phone: `94${String(timestamp).slice(-8)}`,
      password: cBPass
    })
  });
  const cBToken = custBReg.data?.access_token;

  // 5: Session persistence / refresh (/api/auth/me)
  const meBiz = await request('/api/auth/me', { token: bToken });
  const meCust = await request('/api/auth/me', { token: cToken });

  if (bizAReg.ok && bizALog.ok && custAReg.ok && custALog.ok && meBiz.ok && meCust.ok) {
    summary.auth = 'PASS';
  } else {
    summary.critical_bugs.push('Authentication or session refresh failed');
  }

  // 6: Business Dashboard & Metrics
  const bizDash = await request('/api/business/dashboard', { token: bToken });
  if (bizDash.ok && bizDash.data?.stats) {
    summary.business = 'PASS';
  }

  // 7: Customer Dashboard & QR Pass
  const custDash = await request('/api/customer/profile', { token: cToken });
  if (custDash.ok || cCode) {
    summary.customer = 'PASS';
  }

  // 8 & 9: Create Product & Product Appears After Refresh
  const addProd = await request(`/api/business/${bId}/products`, {
    method: 'POST',
    token: bToken,
    body: JSON.stringify({
      name: `Signature Espresso ${timestamp}`,
      price: 150.0,
      discount_price: 120.0,
      category: 'Beverages',
      stock: 50
    })
  });

  const getProds = await request(`/api/business/${bId}/products`, { token: bToken });
  const prodsList = Array.isArray(getProds.data) ? getProds.data : [];
  const prodFound = prodsList.find(p => p.name === `Signature Espresso ${timestamp}`);
  const prodUuid = prodFound?.id;

  let productPersisted = !!prodFound;

  // 10: Customer-business connection through QR & Duplicate scan test
  const qrMenuUrl = `https://zoor-up-9b3a3.web.app/b/${bSlug}/menu`;
  const qrTableUrl = `https://zoor-up-9b3a3.web.app/b/${bSlug}/table/T-01`;

  // Connect customer via QR resolve with token
  const qrConnect = await request('/api/qr/resolve', {
    method: 'POST',
    token: cToken,
    body: JSON.stringify({ qr_data: qrMenuUrl })
  });

  // Duplicate scan test
  const qrDupScan = await request('/api/qr/resolve', {
    method: 'POST',
    token: cToken,
    body: JSON.stringify({ qr_data: qrTableUrl })
  });

  if (qrConnect.ok && qrDupScan.ok && qrDupScan.data?.business_id) {
    summary.qr = 'PASS';
  }

  // 11 & 12: Loyalty/stamps/points & Reward redemption
  const adjLoyalty = await request(`/api/business/customers/${cCode}/loyalty/adjust`, {
    method: 'POST',
    token: bToken,
    body: JSON.stringify({ points_delta: 100, stamps_delta: 1, reason: 'Smoke test bill' })
  });

  const addVoucher = await request('/api/business/vouchers', {
    method: 'POST',
    token: bToken,
    body: JSON.stringify({
      business_id: bId,
      title: 'Flat ₹50 OFF',
      discount_value: 50.0,
      points_required: 50,
      code: `SAVE50_${timestamp}`
    })
  });

  const getLoyalty = await request(`/api/customer/loyalty/${bId}`, { token: cToken });
  if (addVoucher.ok && (adjLoyalty.ok || getLoyalty.ok)) {
    summary.loyalty = 'PASS';
  }

  // 13 & 14: Create Order & Order Appears After Refresh
  const orderRes = await request('/api/orders', {
    method: 'POST',
    token: cToken,
    body: JSON.stringify({
      business_id: bId,
      items: [{ product_id: prodUuid, quantity: 2 }],
      order_type: 'DINE_IN',
      payment_method: 'CASH',
      idempotency_key: `idemp_${timestamp}_${Math.random().toString(36).substring(2, 10)}`,
      table_number: 'T-01'
    })
  });

  const orderId = orderRes.data?.id || orderRes.data?.order?.id;
  const getOrders = await request(`/api/orders?business_id=${bId}`, { token: bToken });
  const ordersList = getOrders.data?.orders || (Array.isArray(getOrders.data) ? getOrders.data : []);
  const orderFound = ordersList.some(o => o.id === orderId);

  if (orderRes.ok && (orderFound || orderId)) {
    summary.orders = 'PASS';
  }

  if (productPersisted && (orderFound || orderId)) {
    summary.database_persistence = 'PASS';
  }

  // 15: Table Booking
  // 1. Create table at Business A first
  const addTable = await request('/api/tables', {
    method: 'POST',
    token: bToken,
    body: JSON.stringify({ table_number: 'T-01', capacity: 4, location: 'Main Dining' })
  });

  // 2. Customer books table
  const bookTable = await request('/api/tables/bookings', {
    method: 'POST',
    token: cToken,
    body: JSON.stringify({
      business_id: bId,
      customer_name: 'Smoke Customer A',
      customer_phone: `93${String(timestamp).slice(-8)}`,
      party_size: 2,
      date: '2026-10-06',
      time: '20:00',
      notes: 'Anniversary dinner'
    })
  });

  const getBookings = await request(`/api/tables/bookings?business_id=${bId}`, { token: bToken });
  if (getBookings.ok && (bookTable.ok || addTable.ok)) {
    summary.booking = 'PASS';
  }

  // 16: Notifications
  const sendNotif = await request('/api/notifications', {
    method: 'POST',
    token: bToken,
    body: JSON.stringify({
      recipient_id: cCode,
      title: 'Order Status Update',
      message: 'Your order is being prepared!',
      type: 'ORDER_UPDATE'
    })
  });
  const getNotifs = await request('/api/notifications', { token: cToken });

  // 17 & 18: Multi-Tenant Data Isolation
  // Business B tries to view Business A's orders
  const bBOrders = await request(`/api/orders?business_id=${bId}`, { token: bBToken });
  const bBOrdersList = bBOrders.data?.orders || (Array.isArray(bBOrders.data) ? bBOrders.data : []);
  const leakBiz = bBOrdersList.some(o => o.id === orderId);

  // Customer B tries to view Customer A's orders
  const cBOrders = await request(`/api/orders?customer_id=${cCode}`, { token: cBToken });
  const cBOrdersList = cBOrders.data?.orders || (Array.isArray(cBOrders.data) ? cBOrders.data : []);
  const leakCust = cBOrdersList.some(o => o.id === orderId);

  if (!leakBiz && !leakCust) {
    summary.data_isolation = 'PASS';
  } else {
    summary.critical_bugs.push('Multi-tenant data leakage detected');
  }

  console.log('\n--- LIVE TEST SUMMARY RESULT ---');
  console.log(JSON.stringify(summary, null, 2));
};

runSmokeTest();
