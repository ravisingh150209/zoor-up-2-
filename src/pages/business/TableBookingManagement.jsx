import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  Settings,
  Coffee,
  UserCheck,
  ChevronRight,
  Filter,
  Save,
  Check
} from 'lucide-react';
import { tableBookingService, BOOKING_STATUSES } from '../../services/tableBookingService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Controls';
import { Modal } from '../../components/ui/Modal';
import { LoadingState } from '../../components/ui/States';

export const TableBookingManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const businessId = user?.business_id || user?.id;

  const [activeTab, setActiveTab] = useState('TODAY'); // TODAY | UPCOMING | PAST | TABLES | SETTINGS
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [tables, setTables] = useState([]);
  const [settings, setSettings] = useState(tableBookingService.getDefaultSettings());

  // Modals
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [tableForm, setTableForm] = useState({
    table_number: '',
    capacity: 4,
    location: 'Main Dining',
    is_active: true,
  });

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [statusNotes, setStatusNotes] = useState('');

  useEffect(() => {
    if (businessId) {
      loadAllData();
    }
  }, [businessId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [bList, tList, sData] = await Promise.all([
        tableBookingService.getBusinessBookings(businessId),
        tableBookingService.getTables(businessId),
        tableBookingService.getBookingSettings(businessId),
      ]);
      setBookings(bList);
      setTables(tList);
      setSettings(sData);
    } catch (err) {
      console.error(err);
      addToast('Error loading table bookings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await tableBookingService.saveBookingSettings(businessId, settings);
      addToast('Table booking configuration updated successfully!', 'success');
    } catch (err) {
      addToast(err.message || 'Error updating settings', 'error');
    }
  };

  const handleOpenTableModal = (tbl = null) => {
    if (tbl) {
      setEditingTable(tbl);
      setTableForm({
        table_number: tbl.table_number,
        capacity: tbl.capacity,
        location: tbl.location || 'Main Dining',
        is_active: tbl.is_active !== false,
      });
    } else {
      setEditingTable(null);
      setTableForm({
        table_number: `T-${tables.length + 1}`,
        capacity: 4,
        location: 'Main Dining',
        is_active: true,
      });
    }
    setTableModalOpen(true);
  };

  const handleSaveTable = async (e) => {
    e.preventDefault();
    if (!tableForm.table_number.trim()) {
      addToast('Table number / name is required', 'error');
      return;
    }

    try {
      if (editingTable) {
        await tableBookingService.updateTable(editingTable.id, tableForm);
        addToast(`Table ${tableForm.table_number} updated`, 'success');
      } else {
        await tableBookingService.createTable(businessId, tableForm);
        addToast(`Table ${tableForm.table_number} added`, 'success');
      }
      setTableModalOpen(false);
      const updatedTables = await tableBookingService.getTables(businessId);
      setTables(updatedTables);
    } catch (err) {
      addToast(err.message || 'Failed to save table', 'error');
    }
  };

  const handleDeleteTable = async (id, name) => {
    if (window.confirm(`Delete table ${name}? This cannot be undone.`)) {
      try {
        await tableBookingService.deleteTable(id);
        addToast(`Table ${name} deleted`, 'success');
        const updatedTables = await tableBookingService.getTables(businessId);
        setTables(updatedTables);
      } catch (err) {
        addToast(err.message || 'Error deleting table', 'error');
      }
    }
  };

  const handleUpdateStatus = async (bookingId, newStatus) => {
    try {
      await tableBookingService.updateBookingStatus(bookingId, newStatus, {
        notes: statusNotes || undefined,
        updated_by: user?.name || 'Manager',
      });
      addToast(`Booking marked as ${newStatus}`, 'success');
      setStatusModalOpen(false);
      setSelectedBooking(null);
      setStatusNotes('');
      const updatedBookings = await tableBookingService.getBusinessBookings(businessId);
      setBookings(updatedBookings);
    } catch (err) {
      addToast(err.message || 'Status update failed', 'error');
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const todayBookings = bookings.filter((b) => b.booking_date === todayStr);
  const upcomingBookings = bookings.filter((b) => b.booking_date > todayStr);
  const pastBookings = bookings.filter((b) => b.booking_date < todayStr);

  const getStatusBadge = (status) => {
    switch (status) {
      case BOOKING_STATUSES.CONFIRMED:
        return <Badge variant="success" icon={CheckCircle2}>Confirmed</Badge>;
      case BOOKING_STATUSES.PENDING:
        return <Badge variant="warning" icon={Clock}>Pending Review</Badge>;
      case BOOKING_STATUSES.ARRIVED:
        return <Badge variant="info" icon={UserCheck}>Guest Arrived</Badge>;
      case BOOKING_STATUSES.COMPLETED:
        return <Badge variant="neutral" icon={Check}>Completed</Badge>;
      case BOOKING_STATUSES.CANCELLED:
        return <Badge variant="danger" icon={XCircle}>Cancelled</Badge>;
      case BOOKING_STATUSES.REJECTED:
        return <Badge variant="danger" icon={XCircle}>Rejected</Badge>;
      case BOOKING_STATUSES.NO_SHOW:
        return <Badge variant="danger" icon={AlertCircle}>No Show</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderBookingCard = (b) => {
    const tableObj = tables.find((t) => t.id === b.table_id);
    const tableName = tableObj ? `${tableObj.table_number} (${tableObj.location})` : b.table_name || 'Unassigned';

    return (
      <div
        key={b.id}
        className="card"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          padding: '1.25rem',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748B', fontWeight: 600 }}>
                {b.id}
              </span>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1A2B49', margin: '2px 0 0' }}>
                {b.customer_name}
              </h4>
              <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
                📞 {b.customer_phone || 'No phone'}
              </p>
            </div>
            <div>{getStatusBadge(b.status)}</div>
          </div>

          <div
            style={{
              background: '#FAFAFB',
              border: '1px solid #F1F5F9',
              borderRadius: '10px',
              padding: '0.75rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem',
              fontSize: '0.825rem',
            }}
          >
            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem' }}>Date & Time</span>
              <strong style={{ color: '#1A2B49' }}>
                📅 {b.booking_date} at {b.booking_time}
              </strong>
            </div>
            <div>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem' }}>Party Size</span>
              <strong style={{ color: '#1A2B49' }}>
                👥 {b.party_size} {b.party_size === 1 ? 'Guest' : 'Guests'}
              </strong>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem' }}>Table Reserved</span>
              <strong style={{ color: '#D97706' }}>
                🪑 {tableName}
              </strong>
            </div>
          </div>

          {b.special_notes && (
            <p style={{ fontSize: '0.8rem', color: '#475569', background: '#FEF3C7', padding: '0.4rem 0.65rem', borderRadius: '6px', marginTop: '0.75rem', margin: '0.75rem 0 0' }}>
              <strong>Note:</strong> {b.special_notes}
            </p>
          )}
        </div>

        {/* Action Controls for Management */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem' }}>
          {b.status === BOOKING_STATUSES.PENDING && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpdateStatus(b.id, BOOKING_STATUSES.CONFIRMED)}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', background: '#16A34A' }}
              >
                Confirm
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUpdateStatus(b.id, BOOKING_STATUSES.REJECTED)}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', color: '#DC2626' }}
              >
                Reject
              </Button>
            </>
          )}

          {b.status === BOOKING_STATUSES.CONFIRMED && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleUpdateStatus(b.id, BOOKING_STATUSES.ARRIVED)}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
              >
                Mark Arrived
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUpdateStatus(b.id, BOOKING_STATUSES.NO_SHOW)}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', color: '#DC2626' }}
              >
                No Show
              </Button>
            </>
          )}

          {b.status === BOOKING_STATUSES.ARRIVED && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleUpdateStatus(b.id, BOOKING_STATUSES.COMPLETED)}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', background: '#16A34A' }}
            >
              Mark Completed
            </Button>
          )}

          {(b.status === BOOKING_STATUSES.CONFIRMED || b.status === BOOKING_STATUSES.PENDING) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleUpdateStatus(b.id, BOOKING_STATUSES.CANCELLED)}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem', color: '#64748B' }}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <LoadingState message="Loading table booking system..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
            Table Booking & Reservations
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Manage dine-in reservations, seating floor plan, time slots, and guest arrivals.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button
            variant="outline"
            icon={Plus}
            onClick={() => handleOpenTableModal()}
          >
            Add Table
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'TODAY', label: `Today's Bookings (${todayBookings.length})` },
          { id: 'UPCOMING', label: `Upcoming (${upcomingBookings.length})` },
          { id: 'PAST', label: 'Past History' },
          { id: 'TABLES', label: `Tables & Seating (${tables.length})` },
          { id: 'SETTINGS', label: 'Booking Rules' },
        ]}
      />

      {/* TODAY'S BOOKINGS */}
      {activeTab === 'TODAY' && (
        <div>
          {todayBookings.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '3rem 1.5rem',
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
              }}
            >
              <Coffee size={44} style={{ color: '#94A3B8', margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1A2B49' }}>No bookings for today</h3>
              <p style={{ color: '#64748B', fontSize: '0.85rem', maxWidth: '400px', margin: '0.35rem auto 1rem' }}>
                When customers reserve tables online through your store or digital menu, their reservations will appear here in real time.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {todayBookings.map(renderBookingCard)}
            </div>
          )}
        </div>
      )}

      {/* UPCOMING BOOKINGS */}
      {activeTab === 'UPCOMING' && (
        <div>
          {upcomingBookings.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '3rem 1.5rem',
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
              }}
            >
              <Calendar size={44} style={{ color: '#94A3B8', margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1A2B49' }}>No upcoming bookings</h3>
              <p style={{ color: '#64748B', fontSize: '0.85rem', maxWidth: '400px', margin: '0.35rem auto 1rem' }}>
                There are currently no upcoming reservations scheduled.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {upcomingBookings.map(renderBookingCard)}
            </div>
          )}
        </div>
      )}

      {/* PAST HISTORY */}
      {activeTab === 'PAST' && (
        <div>
          {pastBookings.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '3rem 1.5rem',
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
              }}
            >
              <Clock size={44} style={{ color: '#94A3B8', margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1A2B49' }}>No past booking history</h3>
              <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '0.35rem auto 0' }}>
                Completed, cancelled, or past reservations will be archived here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {pastBookings.map(renderBookingCard)}
            </div>
          )}
        </div>
      )}

      {/* TABLES SETUP TAB */}
      {activeTab === 'TABLES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0 }}>
              Configure your dine-in tables, seating capacities, and floor zones.
            </p>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => handleOpenTableModal()}>
              Add New Table
            </Button>
          </div>

          {tables.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '3rem 1.5rem',
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
              }}
            >
              <Users size={44} style={{ color: '#94A3B8', margin: '0 auto 0.75rem' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1A2B49' }}>No tables added yet.</h3>
              <p style={{ color: '#64748B', fontSize: '0.85rem', maxWidth: '400px', margin: '0.35rem auto 1.25rem' }}>
                Add your restaurant or cafe tables so guests can reserve tables online according to party size.
              </p>
              <Button variant="primary" icon={Plus} onClick={() => handleOpenTableModal()}>
                + Add Table
              </Button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
              {tables.map((t) => (
                <div
                  key={t.id}
                  className="card"
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '14px',
                    padding: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1A2B49' }}>
                        {t.table_number}
                      </span>
                      <Badge variant={t.is_active !== false ? 'success' : 'neutral'}>
                        {t.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
                      <p style={{ margin: '0.25rem 0' }}>
                        👥 <strong>Capacity:</strong> {t.capacity} Seats
                      </p>
                      <p style={{ margin: '0.25rem 0' }}>
                        📍 <strong>Area:</strong> {t.location || 'Main Floor'}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Edit2}
                      onClick={() => handleOpenTableModal(t)}
                      style={{ flex: 1, fontSize: '0.75rem' }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      onClick={() => handleDeleteTable(t.id, t.table_number)}
                      style={{ color: '#DC2626', fontSize: '0.75rem' }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BOOKING RULES / SETTINGS TAB */}
      {activeTab === 'SETTINGS' && (
        <div
          className="card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.75rem',
            maxWidth: '650px',
          }}
        >
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.35rem' }}>
            Reservation Rules & Operating Hours
          </h3>
          <p style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Configure when customers can book tables and how reservations are scheduled.
          </p>

          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="checkbox"
                id="booking_enabled"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="booking_enabled" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1A2B49', cursor: 'pointer' }}>
                Enable Online Table Bookings for Customers
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Opening Time
                </label>
                <Input
                  type="time"
                  value={settings.opening_time}
                  onChange={(e) => setSettings({ ...settings, opening_time: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Closing Time
                </label>
                <Input
                  type="time"
                  value={settings.closing_time}
                  onChange={(e) => setSettings({ ...settings, closing_time: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Default Slot Duration (Minutes)
                </label>
                <Input
                  type="number"
                  min="30"
                  max="240"
                  step="15"
                  value={settings.slot_duration_mins}
                  onChange={(e) => setSettings({ ...settings, slot_duration_mins: Number(e.target.value) })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Table Buffer Time (Minutes)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="60"
                  step="5"
                  value={settings.buffer_mins}
                  onChange={(e) => setSettings({ ...settings, buffer_mins: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                Advance Booking Window (Days)
              </label>
              <Input
                type="number"
                min="1"
                max="30"
                value={settings.max_advance_days}
                onChange={(e) => setSettings({ ...settings, max_advance_days: Number(e.target.value) })}
              />
            </div>

            <Button type="submit" variant="primary" icon={Save} style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
              Save Booking Settings
            </Button>
          </form>
        </div>
      )}

      {/* ADD/EDIT TABLE MODAL */}
      <Modal
        isOpen={tableModalOpen}
        onClose={() => setTableModalOpen(false)}
        title={editingTable ? `Edit Table ${editingTable.table_number}` : 'Add New Table'}
      >
        <form onSubmit={handleSaveTable} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
              Table Number / Name <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <Input
              placeholder="e.g. Table 1, T-4, Booth A"
              value={tableForm.table_number}
              onChange={(e) => setTableForm({ ...tableForm, table_number: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                Seating Capacity <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <Input
                type="number"
                min="1"
                max="30"
                value={tableForm.capacity}
                onChange={(e) => setTableForm({ ...tableForm, capacity: Number(e.target.value) })}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                Area / Zone
              </label>
              <select
                value={tableForm.location}
                onChange={(e) => setTableForm({ ...tableForm, location: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  fontSize: '0.875rem',
                  color: '#1A2B49',
                }}
              >
                <option value="Main Dining">Main Dining</option>
                <option value="Window Side">Window Side</option>
                <option value="Outdoor Patio">Outdoor Patio</option>
                <option value="Rooftop">Rooftop</option>
                <option value="Private Booth">Private Booth</option>
                <option value="Bar High-Top">Bar High-Top</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <input
              type="checkbox"
              id="tbl_active"
              checked={tableForm.is_active}
              onChange={(e) => setTableForm({ ...tableForm, is_active: e.target.checked })}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="tbl_active" style={{ fontSize: '0.85rem', color: '#1A2B49', cursor: 'pointer' }}>
              Mark this table active and available for bookings
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <Button type="button" variant="ghost" onClick={() => setTableModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingTable ? 'Update Table' : 'Add Table'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
