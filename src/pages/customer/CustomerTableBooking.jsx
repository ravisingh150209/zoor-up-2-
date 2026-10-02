import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Users,
  Store,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  ArrowLeft,
  Coffee,
  MapPin,
  Check,
  Plus,
  UserCheck
} from 'lucide-react';
import { tableBookingService, BOOKING_STATUSES } from '../../services/tableBookingService';
import { businessService } from '../../services/businessService';
import { customerService } from '../../services/customerService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Tabs } from '../../components/ui/Controls';
import { LoadingState } from '../../components/ui/States';

export const CustomerTableBooking = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const customerId = user?.customer_id || user?.id;

  const [activeTab, setActiveTab] = useState('BOOK'); // BOOK | MY_RESERVATIONS
  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState([]);
  const [myBookings, setMyBookings] = useState([]);

  // Booking Form Flow Steps
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [bookingDate, setBookingDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [bookingTime, setBookingTime] = useState('19:00');
  const [partySize, setPartySize] = useState(2);
  const [specialNotes, setSpecialNotes] = useState('');
  const [selectedTable, setSelectedTable] = useState(null);

  // Available slots / tables calculation
  const [availableTables, setAvailableTables] = useState([]);
  const [businessTablesTotal, setBusinessTablesTotal] = useState(null);
  const [checkingTables, setCheckingTables] = useState(false);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [bookingsVersion, setBookingsVersion] = useState(0);
  const [bookingFilter, setBookingFilter] = useState('ALL'); // ALL | UPCOMING | PAST | CANCELLED

  useEffect(() => {
    loadInitialData();
  }, [customerId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [allBiz, bookingsList, prof] = await Promise.all([
        businessService.getAllBusinesses(),
        tableBookingService.getCustomerBookings(customerId),
        customerService.getProfile(user),
      ]);
      setBusinesses(allBiz);
      if (allBiz.length > 0 && !selectedBusiness) {
        setSelectedBusiness(allBiz[0]);
      }
      setMyBookings(bookingsList);
      setCustomerProfile(prof);
    } catch (err) {
      console.error(err);
      addToast('Error loading booking data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch available tables whenever business, date, time, party size or bookingsVersion changes
  useEffect(() => {
    if (selectedBusiness?.id) {
      checkTableAvailability();
    } else {
      setBusinessTablesTotal(0);
      setAvailableTables([]);
      setSelectedTable(null);
    }
  }, [selectedBusiness?.id, bookingDate, bookingTime, partySize, bookingsVersion]);

  const checkTableAvailability = async () => {
    if (!selectedBusiness?.id) return;
    setCheckingTables(true);
    try {
      const [allTables, tables] = await Promise.all([
        tableBookingService.getTables(selectedBusiness.id, true),
        (bookingDate && bookingTime) 
          ? tableBookingService.getAvailableTables(
              selectedBusiness.id,
              bookingDate,
              bookingTime,
              partySize
            )
          : Promise.resolve([])
      ]);
      setBusinessTablesTotal(allTables.length);
      setAvailableTables(tables);
      // Auto-select first matching table if available
      if (tables.length > 0) {
        setSelectedTable(tables[0]);
      } else {
        setSelectedTable(null);
      }
    } catch (err) {
      console.error('Error checking availability:', err);
    } finally {
      setCheckingTables(false);
    }
  };

  const handleConfirmReservation = async (e) => {
    e.preventDefault();
    if (!selectedBusiness) {
      addToast('Please select a business', 'error');
      return;
    }
    if (!selectedTable) {
      addToast('No available table for this slot and party size. Please choose another time or table.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const newBooking = await tableBookingService.createBooking({
        business_id: selectedBusiness.id,
        business_name: selectedBusiness.name,
        customer_id: customerProfile?.customer_id || customerId,
        customer_name: customerProfile?.name || user?.name || 'Customer',
        customer_phone: customerProfile?.phone || user?.phone || '',
        customer_email: customerProfile?.email || user?.email || '',
        table_id: selectedTable.id,
        table_name: `${selectedTable.table_number} (${selectedTable.location})`,
        party_size: partySize,
        booking_date: bookingDate,
        booking_time: bookingTime,
        special_notes: specialNotes,
      });

      setConfirmedBooking(newBooking);
      setBookingsVersion((v) => v + 1);
      addToast(`Table reserved successfully! Booking ID: ${newBooking.id}`, 'success');
      const updated = await tableBookingService.getCustomerBookings(customerId);
      setMyBookings(updated);
      checkTableAvailability();
    } catch (err) {
      addToast(err.message || 'Could not complete reservation', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (window.confirm('Are you sure you want to cancel this reservation?')) {
      try {
        await tableBookingService.cancelCustomerBooking(bookingId, customerId, 'Cancelled by customer');
        addToast('Reservation cancelled', 'info');
        const updated = await tableBookingService.getCustomerBookings(customerId);
        setMyBookings(updated);
        setBookingsVersion((v) => v + 1);
        checkTableAvailability();
      } catch (err) {
        addToast(err.message || 'Failed to cancel reservation', 'error');
      }
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case BOOKING_STATUSES.CONFIRMED:
        return <Badge variant="success" icon={CheckCircle2}>Confirmed</Badge>;
      case BOOKING_STATUSES.PENDING:
        return <Badge variant="warning" icon={Clock}>Pending Store Review</Badge>;
      case BOOKING_STATUSES.ARRIVED:
        return <Badge variant="info" icon={Check}>Checked In / Arrived</Badge>;
      case BOOKING_STATUSES.COMPLETED:
        return <Badge variant="neutral" icon={CheckCircle2}>Completed</Badge>;
      case BOOKING_STATUSES.CANCELLED:
        return <Badge variant="danger" icon={XCircle}>Cancelled</Badge>;
      case BOOKING_STATUSES.REJECTED:
        return <Badge variant="danger" icon={XCircle}>Declined</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (loading) {
    return <LoadingState message="Loading table reservation system..." />;
  }

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      {/* Page Header */}
      <div>
        <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
          Online Table Booking
        </h2>
        <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '4px 0 0' }}>
          Reserve your table instantly at partner restaurants, cafes, and dining spaces.
        </p>
      </div>

      {/* Profile Advisory Banner if Incomplete */}
      {customerProfile && (!customerProfile.name || !customerProfile.phone) && (
        <div
          style={{
            padding: '0.85rem 1.15rem',
            background: '#EFF6FF',
            border: '1.5px solid #BFDBFE',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <UserCheck size={20} style={{ color: '#2563EB', flexShrink: 0 }} />
            <span style={{ fontSize: '0.85rem', color: '#1E3A8A', fontWeight: 600 }}>
              Tip: Add your name and phone number to your profile so the restaurant can confirm your reservation.
            </span>
          </div>
          <Link
            to="/customer/profile"
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#2563EB',
              textDecoration: 'underline',
              whiteSpace: 'nowrap',
            }}
          >
            Update Profile →
          </Link>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'BOOK') {
            setConfirmedBooking(null);
            setBookingsVersion((v) => v + 1);
            checkTableAvailability();
          }
        }}
        tabs={[
          { id: 'BOOK', label: 'Book a Table' },
          { id: 'MY_RESERVATIONS', label: `My Reservations (${myBookings.length})` },
        ]}
      />

      {/* SUCCESS CONFIRMATION VIEW */}
      {confirmedBooking && activeTab === 'BOOK' && (
        <div
          className="card"
          style={{
            background: '#FFFFFF',
            border: '2px solid #86EFAC',
            borderRadius: '16px',
            padding: '2rem',
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(34, 197, 94, 0.1)',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#DCFCE7',
              color: '#16A34A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}
          >
            <CheckCircle2 size={36} />
          </div>

          <Badge style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', marginBottom: '0.5rem' }}>
            RESERVATION CONFIRMED
          </Badge>

          <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.25rem' }}>
            {confirmedBooking.business_name}
          </h3>
          <p style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#64748B', marginBottom: '1.5rem' }}>
            Booking ID: <strong>{confirmedBooking.id}</strong>
          </p>

          <div
            style={{
              background: '#FAFAFB',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '1.25rem',
              maxWidth: '460px',
              margin: '0 auto 1.5rem',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              fontSize: '0.9rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Date:</span>
              <strong style={{ color: '#1A2B49' }}>{confirmedBooking.booking_date}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Time:</span>
              <strong style={{ color: '#1A2B49' }}>{confirmedBooking.booking_time}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Guests:</span>
              <strong style={{ color: '#1A2B49' }}>{confirmedBooking.party_size} People</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Assigned Table:</span>
              <strong style={{ color: '#D97706' }}>{confirmedBooking.table_name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Status:</span>
              <span>{getStatusBadge(confirmedBooking.status)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Button variant="secondary" onClick={() => setActiveTab('MY_RESERVATIONS')}>
              View All Reservations
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmedBooking(null);
                setSelectedTable(null);
                setBookingsVersion((v) => v + 1);
                checkTableAvailability();
              }}
            >
              Book Another Table
            </Button>
          </div>
        </div>
      )}

      {/* BOOKING FORM VIEW */}
      {!confirmedBooking && activeTab === 'BOOK' && (
        <form onSubmit={handleConfirmReservation} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* STEP 1: Select Business */}
          <div
            className="card"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#1A2B49',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                }}
              >
                1
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1A2B49', margin: 0 }}>
                Select Store / Restaurant
              </h3>
            </div>

            {businesses.length === 0 ? (
              <p style={{ color: '#64748B', fontSize: '0.875rem' }}>
                No registered dining partners available currently.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {businesses.map((b) => {
                  const isSelected = selectedBusiness?.id === b.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBusiness(b)}
                      style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '12px',
                        border: isSelected ? '2px solid #F59E0B' : '1px solid #E2E8F0',
                        background: isSelected ? '#FEF3C7' : '#FAFAFB',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <Store size={20} color={isSelected ? '#D97706' : '#64748B'} />
                        <div>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1A2B49', margin: 0 }}>
                            {b.name}
                          </h4>
                          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            {b.category || 'Dining & Cafe'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedBusiness && (
            <>
              {/* STEP 2: Date, Time & Party Size */}
              <div
                className="card"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '1.5rem',
                }}
              >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#1A2B49',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                }}
              >
                2
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1A2B49', margin: 0 }}>
                Select Date, Time & Guests
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Booking Date <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <Input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Arrival Time <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <Input
                  type="time"
                  value={bookingTime}
                  onChange={(e) => setBookingTime(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Number of Guests <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <select
                  value={partySize}
                  onChange={(e) => setPartySize(Number(e.target.value))}
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
                  {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16].map((num) => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? 'Guest' : 'Guests'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* STEP 3: Available Tables & Seating Selection */}
          <div
            className="card"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#1A2B49',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                }}
              >
                3
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1A2B49', margin: 0 }}>
                Choose Your Table
              </h3>
            </div>

            {checkingTables ? (
              <p style={{ color: '#64748B', fontSize: '0.85rem' }}>
                Verifying real-time table availability with store schedule...
              </p>
            ) : businessTablesTotal === 0 ? (
              <div style={{ padding: '1.25rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', textAlign: 'center' }}>
                <p style={{ color: '#475569', fontSize: '0.9rem', margin: 0, fontWeight: 700 }}>
                  This business has not added any tables yet.
                </p>
                <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: '4px 0 0' }}>
                  Please check back later or contact the store directly.
                </p>
              </div>
            ) : availableTables.length === 0 ? (
              <div style={{ padding: '1.25rem', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '12px' }}>
                <p style={{ color: '#B91C1C', fontSize: '0.9rem', margin: 0, fontWeight: 700 }}>
                  ⚠️ No tables available for this time.
                </p>
                <p style={{ color: '#7F1D1D', fontSize: '0.8rem', margin: '4px 0 0' }}>
                  Try another time slot or try another date to find available seating for {partySize} {partySize === 1 ? 'guest' : 'guests'}.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {availableTables.map((tbl) => {
                  const isSelected = selectedTable?.id === tbl.id;
                  return (
                    <div
                      key={tbl.id}
                      onClick={() => setSelectedTable(tbl)}
                      style={{
                        padding: '1rem',
                        borderRadius: '12px',
                        border: isSelected ? '2px solid #F59E0B' : '1px solid #E2E8F0',
                        background: isSelected ? '#FEF3C7' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '1rem', color: '#1A2B49' }}>{tbl.table_number}</strong>
                        {isSelected && <Badge variant="warning">Selected</Badge>}
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0' }}>
                        📍 {tbl.location || 'Main Floor'}
                      </p>
                      <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0 }}>
                        👥 Capacity: Up to {tbl.capacity}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Special Request Notes */}
            <div style={{ marginTop: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                Optional Notes / Special Requests
              </label>
              <Input
                placeholder="e.g. Birthday celebration, high chair requested, quiet booth"
                value={specialNotes}
                onChange={(e) => setSpecialNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Confirm Button */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                disabled={!selectedTable || availableTables.length === 0}
                icon={CheckCircle2}
                style={{ padding: '0.9rem 1.5rem', fontSize: '1rem' }}
              >
                Confirm Reservation
              </Button>
            </>
          )}
        </form>
      )}

      {/* MY RESERVATIONS VIEW */}
      {activeTab === 'MY_RESERVATIONS' && (
        <div>
          {/* Status Filters */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {['ALL', 'UPCOMING', 'PAST', 'CANCELLED'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setBookingFilter(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: 'none',
                  background: bookingFilter === f ? '#1A2B49' : '#F1F5F9',
                  color: bookingFilter === f ? '#FFFFFF' : '#64748B',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {f === 'ALL' ? `All (${myBookings.length})` : f}
              </button>
            ))}
          </div>

          {(() => {
            const todayStr = new Date().toISOString().split('T')[0];
            const filtered = myBookings.filter((b) => {
              const bDate = b.booking_date || b.date || '';
              if (bookingFilter === 'UPCOMING') {
                return bDate >= todayStr && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(b.status);
              }
              if (bookingFilter === 'PAST') {
                return bDate < todayStr || b.status === 'COMPLETED';
              }
              if (bookingFilter === 'CANCELLED') {
                return b.status === 'CANCELLED' || b.status === 'REJECTED';
              }
              return true;
            });

            if (filtered.length === 0) {
              return (
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
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1A2B49' }}>No bookings found</h3>
                  <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '0.35rem auto 1.25rem' }}>
                    {bookingFilter === 'ALL'
                      ? 'You have not made any table reservations yet. Book your first table above!'
                      : `No ${bookingFilter.toLowerCase()} reservations.`}
                  </p>
                  <Button variant="primary" onClick={() => setActiveTab('BOOK')}>
                    Book a Table Now
                  </Button>
                </div>
              );
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filtered.map((b) => (
                <div
                  key={b.id}
                  className="card"
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '14px',
                    padding: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748B' }}>
                        {b.id}
                      </span>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A2B49', margin: '2px 0 0' }}>
                        {b.business_name}
                      </h4>
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
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '0.5rem',
                      fontSize: '0.825rem',
                    }}
                  >
                    <div>
                      <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem' }}>Date</span>
                      <strong style={{ color: '#1A2B49' }}>📅 {b.booking_date}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem' }}>Time</span>
                      <strong style={{ color: '#1A2B49' }}>⏰ {b.booking_time}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem' }}>Party Size</span>
                      <strong style={{ color: '#1A2B49' }}>👥 {b.party_size} People</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B', display: 'block', fontSize: '0.72rem' }}>Table</span>
                      <strong style={{ color: '#D97706' }}>🪑 {b.table_name}</strong>
                    </div>
                  </div>

                  {b.special_notes && (
                    <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
                      <strong>Note:</strong> {b.special_notes}
                    </p>
                  )}

                  {/* Cancellation allowed if PENDING or CONFIRMED */}
                  {(b.status === BOOKING_STATUSES.PENDING || b.status === BOOKING_STATUSES.CONFIRMED) && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9', paddingTop: '0.5rem' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelBooking(b.id)}
                        style={{ color: '#DC2626', fontSize: '0.8rem' }}
                      >
                        Cancel Reservation
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      )}
    </div>
  );
};
