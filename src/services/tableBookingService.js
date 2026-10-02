import { isProductionEnvironment, localDB } from './storageSeed.js';
import { authStorage } from '../auth/authStorage.js';

import { API_BASE_URL as API_BASE } from '../config/api.js';

export const BOOKING_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  ARRIVED: 'arrived',
  COMPLETED: 'completed',
  NO_SHOW: 'no-show',
};

export const TABLE_LOCATIONS = [
  'Main Dining',
  'Window Side',
  'Outdoor Patio',
  'Rooftop',
  'Private Booth',
  'Bar High-Top'
];

const getHeaders = (extra = {}) => ({
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  ...authStorage.getAuthHeaders(),
  ...extra,
});

const safeApiRequest = async (url, options = {}) => {
  try {
    const resp = await fetch(url, {
      ...options,
      headers: getHeaders(options.headers || {})
    });
    const contentType = resp.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await resp.json().catch(() => null);
    } else {
      const text = await resp.text().catch(() => '');
      data = { detail: text || resp.statusText };
    }

    if (resp.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }
    if (resp.status === 409) {
      throw new Error(data?.detail || 'Sorry, this table was just booked. Please choose another table or time.');
    }
    if (!resp.ok) {
      throw new Error(data?.detail || data?.error || data?.message || `Request failed with status ${resp.status}`);
    }

    return { ok: true, status: resp.status, data };
  } catch (err) {
    throw err;
  }
};

export const tableBookingService = {
  getDefaultSettings: () => ({
    enabled: true,
    slot_duration_mins: 90,
    buffer_mins: 15,
    buffer_time_mins: 15,
    opening_time: '10:00',
    closing_time: '22:30',
    open_time: '10:00',
    close_time: '22:30',
    available_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    max_party_size: 16,
    max_advance_days: 14,
  }),

  // -------------------------------------------------------------
  // TABLE MANAGEMENT
  // -------------------------------------------------------------
  getTables: async (businessId, activeOnly = false) => {
    // 1. Try customer endpoint if available
    try {
      const url = businessId
        ? `${API_BASE}/api/customer/tables?business_id=${encodeURIComponent(businessId)}`
        : `${API_BASE}/api/customer/tables`;
      const resp = await safeApiRequest(url);
      if (resp.ok && Array.isArray(resp.data)) {
        return resp.data.map(t => ({
          ...t,
          table_number: t.table_number || t.name,
          name: t.name || t.table_number,
          location: t.section || t.location || 'Main Dining',
        }));
      }
    } catch (_) {}

    // 2. Fallback to /api/tables/{businessId}
    if (businessId) {
      try {
        const resp = await safeApiRequest(`${API_BASE}/api/tables/${encodeURIComponent(businessId)}?active_only=${activeOnly}`);
        if (resp.ok && Array.isArray(resp.data)) {
          return resp.data.map(t => ({
            ...t,
            table_number: t.table_number || t.name,
            name: t.name || t.table_number,
            location: t.section || t.location || 'Main Dining',
          }));
        }
      } catch (_) {}
    }

    if (isProductionEnvironment()) throw new Error('Tables are unavailable from the backend.');
    // LocalDB fallback
    if (!businessId) return [];
    return localDB.getTables().filter(t => t.business_id === businessId && (!activeOnly || t.is_active));
  },

  createTable: async (businessId, tableData) => {
    try {
      const resp = await safeApiRequest(`${API_BASE}/api/tables`, {
        method: 'POST',
        body: JSON.stringify({
          table_number: tableData.table_number || tableData.name,
          capacity: Number(tableData.capacity) || 4,
          location: tableData.section || tableData.location || 'Main Dining',
          is_active: tableData.is_active !== false,
          notes: tableData.notes || '',
        })
      });
      if (resp.ok && resp.data) return resp.data;
    } catch (_) {}

    if (isProductionEnvironment()) throw new Error('Table creation failed on the backend.');

    // Fallback to localDB
    const tables = localDB.getTables();
    const newTable = {
      id: `tbl_${Date.now()}`,
      business_id: businessId,
      name: tableData.table_number || tableData.name,
      table_number: tableData.table_number || tableData.name,
      capacity: Number(tableData.capacity) || 4,
      location: tableData.location || 'Main Dining',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    tables.push(newTable);
    localDB.saveTables(tables);
    return newTable;
  },

  updateTable: async (businessId, tableId, updates) => {
    try {
      const resp = await safeApiRequest(`${API_BASE}/api/tables/${encodeURIComponent(tableId)}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      if (resp.ok && resp.data) return resp.data;
    } catch (_) {}

    if (isProductionEnvironment()) throw new Error('Table update failed on the backend.');

    const tables = localDB.getTables();
    const idx = tables.findIndex(t => t.id === tableId);
    if (idx !== -1) {
      tables[idx] = { ...tables[idx], ...updates, updated_at: new Date().toISOString() };
      localDB.saveTables(tables);
      return tables[idx];
    }
    throw new Error('Table not found');
  },

  deleteTable: async (businessId, tableId) => {
    try {
      const resp = await safeApiRequest(`${API_BASE}/api/tables/${encodeURIComponent(tableId)}`, {
        method: 'DELETE'
      });
      if (resp.ok) return true;
    } catch (_) {}

    if (isProductionEnvironment()) throw new Error('Table deletion failed on the backend.');

    let tables = localDB.getTables();
    tables = tables.filter(t => t.id !== tableId);
    localDB.saveTables(tables);
    return true;
  },

  // -------------------------------------------------------------
  // SETTINGS & AVAILABILITY
  // -------------------------------------------------------------
  getTableSettings: async (businessId) => {
    if (!businessId) return tableBookingService.getDefaultSettings();
    try {
      const resp = await safeApiRequest(`${API_BASE}/api/tables/settings?business_id=${encodeURIComponent(businessId)}`);
      if (resp.ok && resp.data) return resp.data;
    } catch (_) {}

    if (isProductionEnvironment()) throw new Error('Table booking settings are unavailable from the backend.');
    const settings = localDB.getTableSettings(businessId);
    return settings || tableBookingService.getDefaultSettings();
  },

  updateTableSettings: async (businessId, newSettings) => {
    try {
      const resp = await safeApiRequest(`${API_BASE}/api/tables/settings?business_id=${encodeURIComponent(businessId)}`, {
        method: 'PUT',
        body: JSON.stringify(newSettings)
      });
      if (resp.ok && resp.data) return resp.data;
    } catch (_) {}

    if (isProductionEnvironment()) throw new Error('Table booking settings could not be saved on the backend.');
    localDB.saveTableSettings(businessId, newSettings);
    return newSettings;
  },

  getAvailableTables: async (businessId, date, time, partySize = 2) => {
    if (!businessId || !date || !time) return [];

    try {
      const url = `${API_BASE}/api/customer/table-availability?business_id=${encodeURIComponent(businessId)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}&guests=${partySize}`;
      const resp = await safeApiRequest(url);
      if (resp.ok && Array.isArray(resp.data)) {
        return resp.data.map(t => ({
          ...t,
          table_number: t.table_number || t.name,
          name: t.name || t.table_number,
          location: t.section || t.location || 'Main Dining',
        }));
      }
    } catch (_) {
      try {
        const url2 = `${API_BASE}/api/tables/${encodeURIComponent(businessId)}/available?date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}&party_size=${partySize}`;
        const resp2 = await safeApiRequest(url2);
        if (resp2.ok && Array.isArray(resp2.data)) {
          return resp2.data.map(t => ({
            ...t,
            table_number: t.table_number || t.name,
            name: t.name || t.table_number,
            location: t.section || t.location || 'Main Dining',
          }));
        }
      } catch (err) {
        console.error('Availability check error:', err);
      }
    }

    if (isProductionEnvironment()) throw new Error('Table availability is unavailable from the backend.');
    // Local fallback
    const tables = await tableBookingService.getTables(businessId, true);
    return tables.filter(t => (t.capacity || 2) >= partySize);
  },

  // -------------------------------------------------------------
  // BOOKING CREATION & LIFECYCLE
  // -------------------------------------------------------------
  createBooking: async (bookingData) => {
    const business_id = bookingData.business_id;
    const targetDate = bookingData.booking_date || bookingData.date;
    const targetTime = bookingData.booking_time || bookingData.time;
    const partySize = Number(bookingData.party_size || bookingData.guests) || 1;

    if (!business_id) throw new Error('Business ID is required');
    if (!targetDate) throw new Error('Please select a valid date');
    if (!targetTime) throw new Error('Please select an arrival time');
    if (partySize < 1) throw new Error('Please select number of guests');
    if (!bookingData.table_id) throw new Error('No table selected');

    // 1. Try Backend API: /api/customer/table-reservations (Authenticated JWT resolves customer)
    try {
      const resp = await safeApiRequest(`${API_BASE}/api/customer/table-reservations`, {
        method: 'POST',
        body: JSON.stringify({
          business_id,
          booking_date: targetDate,
          date: targetDate,
          booking_time: targetTime,
          time: targetTime,
          party_size: partySize,
          guests: partySize,
          table_id: bookingData.table_id,
          special_notes: bookingData.special_notes || bookingData.notes || '',
          notes: bookingData.special_notes || bookingData.notes || '',
        }),
      });

      if (resp.ok && resp.data) {
        const created = resp.data;
        if (!isProductionEnvironment()) {
          const bookings = localDB.getTableBookings();
          bookings.unshift(created);
          localDB.saveTableBookings(bookings);
        }
        return created;
      }
    } catch (e) {
      if (e.message && (
        e.message.includes('booked') ||
        e.message.includes('expired') ||
        e.message.includes('capacity') ||
        e.message.includes('complete your profile')
      )) {
        throw e;
      }

      // Try fallback to /api/tables/bookings
      try {
        const resp2 = await safeApiRequest(`${API_BASE}/api/tables/bookings`, {
          method: 'POST',
          body: JSON.stringify({
            business_id,
            booking_date: targetDate,
            booking_time: targetTime,
            party_size: partySize,
            table_id: bookingData.table_id,
            special_notes: bookingData.special_notes || bookingData.notes || '',
          }),
        });
        if (resp2.ok && resp2.data) return resp2.data;
      } catch (err2) {
        throw err2;
      }
    }

    if (isProductionEnvironment()) throw new Error('Booking could not be created on the backend. No local booking was created.');
    // 2. Offline / localDB fallback with double-booking check
    const bookings = localDB.getTableBookings();
    const count = bookings.length + 1;
    const bookingId = `TR-${new Date().getFullYear()}-${String(count).padStart(5, '0')}`;

    const newBooking = {
      id: bookingId,
      booking_id: bookingId,
      business_id,
      business_name: bookingData.business_name || 'Store Partner',
      customer_id: bookingData.customer_id || 'ZUP-CUS-GUEST',
      customer_name: (bookingData.customer_name || 'Customer').trim(),
      customer_phone: (bookingData.customer_phone || '').trim(),
      customer_email: bookingData.customer_email || '',
      booking_date: targetDate,
      date: targetDate,
      booking_time: targetTime,
      time: targetTime,
      party_size: partySize,
      guests: partySize,
      table_id: bookingData.table_id,
      table_name: bookingData.table_name || 'Table',
      special_notes: bookingData.special_notes || bookingData.notes || '',
      notes: bookingData.special_notes || bookingData.notes || '',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    bookings.unshift(newBooking);
    localDB.saveTableBookings(bookings);
    return newBooking;
  },

  // -------------------------------------------------------------
  // CUSTOMER BOOKINGS LIST
  // -------------------------------------------------------------
  getCustomerBookings: async (customerId) => {
    // 1. Try customer reservations endpoint (enforces JWT isolation)
    try {
      const resp = await safeApiRequest(`${API_BASE}/api/customer/table-reservations`);
      if (resp.ok && Array.isArray(resp.data)) {
        return resp.data;
      }
    } catch (_) {}

    // Fallback to legacy path
    if (customerId) {
      try {
        const resp2 = await safeApiRequest(`${API_BASE}/api/tables/bookings/customer/${encodeURIComponent(customerId)}`);
        if (resp2.ok && Array.isArray(resp2.data)) {
          return resp2.data;
        }
      } catch (_) {}
    }

    if (isProductionEnvironment()) throw new Error('Your bookings are unavailable from the backend.');
    return localDB.getTableBookings().filter(b => b.customer_id === customerId);
  },

  // -------------------------------------------------------------
  // BUSINESS BOOKINGS LIST
  // -------------------------------------------------------------
  getBusinessBookings: async (businessId, status = null) => {
    try {
      let url = `${API_BASE}/api/tables/reservations`;
      if (businessId) url += `?business_id=${encodeURIComponent(businessId)}`;
      if (status && status !== 'ALL') url += `&status=${encodeURIComponent(status)}`;
      const resp = await safeApiRequest(url);
      if (resp.ok && Array.isArray(resp.data)) return resp.data;
    } catch (_) {}

    if (isProductionEnvironment()) throw new Error('Business bookings are unavailable from the backend.');
    if (!businessId) return [];

    let list = localDB.getTableBookings().filter(b => b.business_id === businessId);
    if (status && status !== 'ALL') {
      list = list.filter(b => (b.status || '').toLowerCase() === status.toLowerCase());
    }
    return list;
  },

  // -------------------------------------------------------------
  // STATUS UPDATES & CANCELLATION
  // -------------------------------------------------------------
  updateBookingStatus: async (bookingId, newStatus, extra = {}) => {
    try {
      const resp = await safeApiRequest(`${API_BASE}/api/tables/reservations/${encodeURIComponent(bookingId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, notes: extra.notes }),
      });
      if (resp.ok && resp.data) {
        return resp.data;
      }
    } catch (_) {
      try {
        const resp2 = await safeApiRequest(`${API_BASE}/api/tables/bookings/${encodeURIComponent(bookingId)}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus, notes: extra.notes }),
        });
        if (resp2.ok && resp2.data) return resp2.data;
      } catch (err) {
        console.error('Update status error:', err);
      }
    }

    if (isProductionEnvironment()) throw new Error('Booking status could not be updated on the backend.');
    const bookings = localDB.getTableBookings();
    const idx = bookings.findIndex(b => b.id === bookingId);
    if (idx !== -1) {
      bookings[idx] = {
        ...bookings[idx],
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...extra,
      };
      localDB.saveTableBookings(bookings);
      return bookings[idx];
    }
    throw new Error('Booking not found');
  },

  cancelCustomerBooking: async (bookingId, customerId, reason = 'Cancelled by customer') => {
    try {
      const resp = await safeApiRequest(`${API_BASE}/api/customer/table-reservations/${encodeURIComponent(bookingId)}/cancel`, {
        method: 'PUT'
      });
      if (resp.ok && resp.data) return resp.data;
    } catch (_) {
      try {
        const resp2 = await safeApiRequest(`${API_BASE}/api/tables/bookings/${encodeURIComponent(bookingId)}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        if (resp2.ok && resp2.data) return resp2.data;
      } catch (err) {
        throw err;
      }
    }

    if (isProductionEnvironment()) throw new Error('Booking cancellation failed on the backend.');
    return tableBookingService.updateBookingStatus(bookingId, BOOKING_STATUSES.CANCELLED, {
      cancellation_reason: reason,
      cancelled_by: 'CUSTOMER',
    });
  },

  getBookingSettings: async (businessId) => tableBookingService.getTableSettings(businessId),
  saveBookingSettings: async (businessId, settings) => tableBookingService.updateTableSettings(businessId, settings),
};
