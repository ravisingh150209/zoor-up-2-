import { localDB } from './storageSeed.js';
import { authService } from './authService.js';

const NOTIFICATIONS_STORAGE_KEY = 'zoorup_notifications';
const REMINDERS_STORAGE_KEY = 'zoorup_sent_reminders';
import { API_BASE_URL } from '../config/api.js';

export const NOTIFICATION_TYPES = {
  BOOKING: 'BOOKING',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_PENDING: 'BOOKING_PENDING',
  BOOKING_REMINDER_24H: 'BOOKING_REMINDER_24H',
  BOOKING_REMINDER_2H: 'BOOKING_REMINDER_2H',
  REWARD_READY: 'REWARD_READY',
  LOYALTY: 'LOYALTY',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  WIN_BACK: 'WIN_BACK',
  SYSTEM: 'SYSTEM',
};

export const notificationService = {
  // --------------------------------------------------------------------------
  // GET USER NOTIFICATIONS (TENANT ISOLATED)
  // --------------------------------------------------------------------------
  getUserNotifications: async (user) => {
    if (!user) return [];
    const token = authService.getToken();

    if (API_BASE_URL && token) {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/notifications`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          return data.notifications || [];
        }
      } catch (_) {}
    }

    // Local / Resilient Fallback with strict tenant isolation
    const all = localDB.getNotifications() || [];
    const userRole = (user.role || '').toLowerCase();
    const userId = user.id;
    const custId = user.customer_id;
    const bizId = user.business_id;

    const filtered = all.filter((n) => {
      const recId = n.recipient_id;
      const nBiz = n.business_id;

      if (userRole === 'customer') {
        return recId === userId || (custId && recId === custId);
      }
      if (userRole === 'business') {
        return recId === userId || (bizId && (nBiz === bizId || recId === bizId));
      }
      if (userRole === 'admin') {
        return true;
      }
      return recId === userId;
    });

    return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  // --------------------------------------------------------------------------
  // UNREAD NOTIFICATIONS COUNT
  // --------------------------------------------------------------------------
  getUnreadCount: async (user) => {
    if (!user) return 0;
    const notifs = await notificationService.getUserNotifications(user);
    return notifs.filter((n) => !n.is_read).length;
  },

  // --------------------------------------------------------------------------
  // CREATE NOTIFICATION
  // --------------------------------------------------------------------------
  createNotification: async ({
    recipient_id,
    business_id = null,
    recipient_phone = '',
    type = NOTIFICATION_TYPES.SYSTEM,
    title,
    message,
    entity_id = null,
    action_url = '',
    send_sms = false,
  }) => {
    const token = authService.getToken();
    const payload = {
      recipient_id,
      business_id,
      recipient_phone,
      type,
      title,
      message,
      entity_id,
      action_url,
      send_sms,
    };

    if (API_BASE_URL && token) {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/notifications`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (resp.ok) {
          const res = await resp.json();
          return res.notification;
        }
      } catch (_) {}
    }

    // Local DB save
    const all = localDB.getNotifications() || [];
    const newNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipient_id,
      business_id,
      recipient_phone,
      type,
      title,
      message,
      entity_id,
      action_url,
      is_read: false,
      created_at: new Date().toISOString(),
      sms_delivery: send_sms
        ? { dispatched: false, channel: 'SMS', status: 'PROVIDER_NOT_CONFIGURED' }
        : { dispatched: false, channel: 'IN_APP', status: 'IN_APP_ONLY' },
    };

    all.unshift(newNotif);
    localDB.saveNotifications(all);
    return newNotif;
  },

  // --------------------------------------------------------------------------
  // MARK SINGLE NOTIFICATION AS READ
  // --------------------------------------------------------------------------
  markAsRead: async (notifId, user) => {
    if (!notifId) return false;
    const token = authService.getToken();

    if (API_BASE_URL && token) {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/notifications/${notifId}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) return true;
      } catch (_) {}
    }

    const all = localDB.getNotifications() || [];
    const updated = all.map((n) => (n.id === notifId ? { ...n, is_read: true, updated_at: new Date().toISOString() } : n));
    localDB.saveNotifications(updated);
    return true;
  },

  // --------------------------------------------------------------------------
  // MARK ALL USER NOTIFICATIONS AS READ
  // --------------------------------------------------------------------------
  markAllAsRead: async (user) => {
    if (!user) return 0;
    const token = authService.getToken();

    if (API_BASE_URL && token) {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/notifications/mark-all-read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const res = await resp.json();
          return res.updated_count || 0;
        }
      } catch (_) {}
    }

    const all = localDB.getNotifications() || [];
    const userRole = (user.role || '').toLowerCase();
    const userId = user.id;
    const custId = user.customer_id;
    const bizId = user.business_id;

    let count = 0;
    const updated = all.map((n) => {
      const recId = n.recipient_id;
      const nBiz = n.business_id;
      let matches = false;

      if (userRole === 'customer') {
        matches = recId === userId || (custId && recId === custId);
      } else if (userRole === 'business') {
        matches = recId === userId || (bizId && (nBiz === bizId || recId === bizId));
      } else if (userRole === 'admin') {
        matches = true;
      }

      if (matches && !n.is_read) {
        count++;
        return { ...n, is_read: true, updated_at: new Date().toISOString() };
      }
      return n;
    });

    localDB.saveNotifications(updated);
    return count;
  },

  // --------------------------------------------------------------------------
  // IDEMPOTENT AUTOMATIC REMINDER SCHEDULER ENGINE
  // --------------------------------------------------------------------------
  runReminderEngine: async (user) => {
    if (!user) return [];
    const token = authService.getToken();

    // Trigger backend reminder check if connected
    if (API_BASE_URL && token) {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/notifications/reminders/trigger-check`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const res = await resp.json();
          return res.reminders || [];
        }
      } catch (_) {}
    }

    // Local Resilient Reminder Scheduler
    const sentReminders = localDB.getStored(REMINDERS_STORAGE_KEY, []);
    const isSent = (key) => sentReminders.some((r) => r.key === key);
    const logSent = (key, data = {}) => {
      sentReminders.push({
        key,
        sent_at: new Date().toISOString(),
        ...data,
      });
      localDB.setStored(REMINDERS_STORAGE_KEY, sentReminders);
    };

    const newDispatched = [];
    const now = new Date();
    const nowTs = now.getTime();

    // 1. Table Booking Reminders (24h & 2h before)
    const bookings = localDB.getTableBookings() || [];
    for (const b of bookings) {
      if (b.status !== 'CONFIRMED') continue;
      const bDate = b.booking_date || b.date;
      const bTime = b.booking_time || b.time;
      if (!bDate || !bTime) continue;

      const bookingDt = new Date(`${bDate}T${bTime}:00`);
      if (isNaN(bookingDt.getTime())) continue;

      const diffMs = bookingDt.getTime() - nowTs;
      const diffHours = diffMs / (1000 * 60 * 60);

      // 24 Hour Reminder (between 23h and 25h ahead)
      const k24 = `BOOKING_24H_${b.id}`;
      if (diffHours >= 23 && diffHours <= 25 && !isSent(k24)) {
        await notificationService.createNotification({
          recipient_id: b.customer_id,
          business_id: b.business_id,
          recipient_phone: b.customer_phone,
          type: NOTIFICATION_TYPES.BOOKING_REMINDER_24H,
          title: `Table Reservation Tomorrow: ${b.business_name}`,
          message: `Reminder: Your table at ${b.business_name} is reserved for tomorrow at ${bTime} (${b.party_size} guests).`,
          entity_id: b.id,
          action_url: '/customer/table-booking',
          send_sms: true,
        });
        logSent(k24, { booking_id: b.id, type: '24H' });
        newDispatched.push(k24);
      }

      // 2 Hour Reminder (between 1h and 2.5h ahead)
      const k2 = `BOOKING_2H_${b.id}`;
      if (diffHours >= 1 && diffHours <= 2.5 && !isSent(k2)) {
        await notificationService.createNotification({
          recipient_id: b.customer_id,
          business_id: b.business_id,
          recipient_phone: b.customer_phone,
          type: NOTIFICATION_TYPES.BOOKING_REMINDER_2H,
          title: `Table Ready in 2 Hours: ${b.business_name}`,
          message: `Reminder: Your table at ${b.business_name} is booked for today at ${bTime}. Table: ${b.table_name || 'Reserved'}.`,
          entity_id: b.id,
          action_url: '/customer/table-booking',
          send_sms: true,
        });
        logSent(k2, { booking_id: b.id, type: '2H' });
        newDispatched.push(k2);
      }
    }

    // 2. Business Pending Booking Reminders
    if (user.role === 'business') {
      const bizId = user.business_id;
      const pendingBookings = bookings.filter((b) => b.business_id === bizId && b.status === 'PENDING');
      for (const pb of pendingBookings) {
        const kPending = `PENDING_BOOKING_${pb.id}`;
        if (!isSent(kPending)) {
          await notificationService.createNotification({
            recipient_id: bizId,
            business_id: bizId,
            type: NOTIFICATION_TYPES.BOOKING_PENDING,
            title: 'Pending Table Reservation Needs Review',
            message: `New reservation request from ${pb.customer_name} for ${pb.party_size} guests on ${pb.booking_date} at ${pb.booking_time}.`,
            entity_id: pb.id,
            action_url: '/business/table-booking',
          });
          logSent(kPending, { booking_id: pb.id, type: 'PENDING_REVIEW' });
          newDispatched.push(kPending);
        }
      }

      // 3. Cash Payments Awaiting Business Confirmation
      const invoices = localDB.getInvoices() || [];
      const pendingCash = invoices.filter(
        (inv) => inv.business_id === bizId && inv.payment_method === 'CASH' && inv.status === 'PENDING'
      );
      for (const inv of pendingCash) {
        const kCash = `PENDING_CASH_${inv.id}`;
        if (!isSent(kCash)) {
          await notificationService.createNotification({
            recipient_id: bizId,
            business_id: bizId,
            type: NOTIFICATION_TYPES.PAYMENT_PENDING,
            title: 'Counter Cash Payment Awaiting Confirmation',
            message: `Cash receipt of ₹${inv.total_amount || inv.amount} from ${inv.customer_name || 'Customer'} requires verification.`,
            entity_id: inv.id,
            action_url: '/business/payments',
          });
          logSent(kCash, { invoice_id: inv.id, type: 'PENDING_CASH' });
          newDispatched.push(kCash);
        }
      }
    }

    // 4. Customer Reward Eligibility Reminders
    if (user.role === 'customer') {
      const custId = user.customer_id;
      const customers = localDB.getCustomers() || [];
      const currentCust = customers.find((c) => c.customer_id === custId || c.id === user.id);
      const points = currentCust?.points || user.points || 0;

      const rewards = localDB.getStored('rewards', []) || [];
      for (const r of rewards) {
        if (!r.active || points < (r.required_points || 500)) continue;
        const kReward = `REWARD_READY_${r.id}_${custId}`;
        if (!isSent(kReward)) {
          await notificationService.createNotification({
            recipient_id: custId,
            business_id: r.business_id,
            type: NOTIFICATION_TYPES.REWARD_READY,
            title: `Reward Ready to Claim: ${r.name}`,
            message: `Congratulations! You have earned ${points} points, enough to claim "${r.name}".`,
            entity_id: r.id,
            action_url: '/customer/rewards',
          });
          logSent(kReward, { reward_id: r.id, customer_id: custId });
          newDispatched.push(kReward);
        }
      }
    }

    return newDispatched;
  },
};
