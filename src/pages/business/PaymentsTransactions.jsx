import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Receipt,
  Clock,
  Search,
  Filter,
  Eye,
  Download,
  ArrowUpDown,
  DollarSign,
  Wallet,
  Zap,
  Shield,
  QrCode,
  Smartphone,
  Banknote,
  Settings,
} from 'lucide-react';
import { paymentService } from '../../services/paymentService';
import { businessService } from '../../services/businessService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { LoadingState, EmptyState } from '../../components/ui/States';
import { Card } from '../../components/ui/Card';

const STATUS_COLORS = {
  pending: '#F59E0B',
  paid: '#10B981',
  completed: '#10B981',
  failed: '#EF4444',
  cancelled: '#64748B',
  refunded: '#8B5CF6',
};

const PAYMENT_MODES = ['UPI', 'CASH', 'CARD', 'ONLINE', 'SUBSCRIPTION'];

export const PaymentsTransactions = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modeFilter, setModeFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [upiSettings, setUpiSettings] = useState(null);
  const [upiLoading, setUpiLoading] = useState(false);
  const [upiSaving, setUpiSaving] = useState(false);

  const bizId = user?.business_id;

  useEffect(() => {
    loadPayments();
    loadUpiSettings();
  }, [bizId, statusFilter, modeFilter, search, dateFrom, dateTo, sortBy, sortDir]);

  const loadUpiSettings = async () => {
    if (!bizId) return;
    setUpiLoading(true);
    try {
      const data = await businessService.getBusinessUpi();
      if (data) setUpiSettings(data);
    } catch (e) {
      console.error('Failed to load UPI settings:', e);
    } finally {
      setUpiLoading(false);
    }
  };

  const saveUpiSettings = async (settings) => {
    if (!bizId) return;
    setUpiSaving(true);
    try {
      const data = await businessService.updateBusinessUpi(settings);
      if (data) setUpiSettings(data);
      addToast('UPI settings saved successfully', 'success');
    } catch (e) {
      addToast(e.message || 'Failed to save UPI settings', 'error');
    } finally {
      setUpiSaving(false);
    }
  };

  const loadPayments = async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const data = await paymentService.getPayments(bizId, {
        status: statusFilter,
        mode: modeFilter,
        search,
        date_from: dateFrom,
        date_to: dateTo,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      setPayments(data || []);
    } catch (e) {
      console.error('Failed to load payments:', e);
      addToast('Failed to load payment data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
  };

  const getSortIcon = (column) => {
    if (sortBy !== column) return <ArrowUpDown size={14} style={{ color: '#94A3B8' }} />;
    return sortDir === 'asc' ? (
      <span style={{ color: '#F59E0B' }}>▲</span>
    ) : (
      <span style={{ color: '#F59E0B' }}>▼</span>
    );
  };

  const getStatusBadge = (status) => {
    const color = STATUS_COLORS[status?.toLowerCase()] || '#64748B';
    return (
      <Badge
        style={{
          background: `${color}15`,
          color,
          border: `1px solid ${color}40`,
        }}
      >
        {status?.charAt(0).toUpperCase() + status?.slice(1).toLowerCase()}
      </Badge>
    );
  };

  const columns = [
    {
      header: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}
          onClick={() => handleSort('created_at')}>
          Date {getSortIcon('created_at')}
        </div>
      ),
      accessor: 'created_at',
      render: (val) => (
        <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
          {new Date(val).toLocaleString()}
        </span>
      ),
    },
    {
      header: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}
          onClick={() => handleSort('payment_id')}>
          Payment ID {getSortIcon('payment_id')}
        </div>
      ),
      accessor: 'payment_id',
      render: (val, row) => (
        <div>
          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{val || row.id}</strong>
          {row.plan_id && (
            <Badge variant="secondary" style={{ marginTop: '2px', fontSize: '0.65rem' }}>
              {row.plan_id}
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}
          onClick={() => handleSort('amount')}>
          Amount {getSortIcon('amount')}
        </div>
      ),
      accessor: 'amount',
      render: (val) => (
        <strong style={{ fontSize: '0.95rem' }}>₹{Number(val || 0).toFixed(2)}</strong>
      ),
    },
    {
      header: 'Mode',
      accessor: 'mode',
      render: (val) => (
        <Badge variant="secondary" style={{ fontSize: '0.7rem' }}>
          {val || 'UPI'}
        </Badge>
      ),
    },
    {
      header: (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}
          onClick={() => handleSort('status')}>
          Status {getSortIcon('status')}
        </div>
      ),
      accessor: 'status',
      render: (val) => getStatusBadge(val),
    },
    {
      header: 'Order / Ref',
      accessor: 'order_id',
      render: (val, row) => (
        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: '#64748B' }}>
          {val || row.transaction_reference || row.order_ref || '-'}
        </span>
      ),
    },
    {
      header: 'Customer',
      accessor: 'customer_name',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{val || row.customer_phone || 'Walk-in'}</div>
          {row.customer_phone && (
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{row.customer_phone}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setSelectedPayment(row); }}
            title="View Details"
          >
            <Eye size={16} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Payments & Transactions</h2>
          <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '4px 0 0' }}>
            View all payment transactions, UPI payments, and subscription billing for this business.
          </p>
        </div>
        <Button variant="outline" icon={Download} onClick={() => addToast('Export coming soon', 'info')}>
          Export
        </Button>
      </div>

      {/* Filters */}
      <Card style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <Input
            placeholder="Search payment ID, order, customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={18} />}
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Status' },
              { value: 'pending', label: 'Pending' },
              { value: 'paid', label: 'Paid' },
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'refunded', label: 'Refunded' },
            ]}
          />
          <Select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Modes' },
              ...PAYMENT_MODES.map(m => ({ value: m, label: m })),
            ]}
          />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From Date"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To Date"
          />
        </div>
      </Card>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Total Revenue</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1A2B49' }}>
                ₹{payments.filter(p => ['paid', 'completed'].includes((p.status || '').toLowerCase())).reduce((sum, p) => sum + Number(p.amount || 0), 0).toLocaleString()}
              </div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Pending Payments</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1A2B49' }}>
                ₹{payments.filter(p => (p.status || '').toLowerCase() === 'pending').reduce((sum, p) => sum + Number(p.amount || 0), 0).toLocaleString()}
              </div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#F3E8FF', color: '#9333EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Subscription Revenue</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1A2B49' }}>
                ₹{payments.filter(p => p.plan_id).reduce((sum, p) => sum + Number(p.amount || 0), 0).toLocaleString()}
              </div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Total Transactions</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1A2B49' }}>
                {payments.length}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Payment Methods */}
      <Card style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>Payment Methods</h3>
          <Badge variant="secondary" style={{ fontSize: '0.7rem' }}>TEST MODE</Badge>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {/* UPI */}
          <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QrCode size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>UPI / QR Code</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Scan to pay via any UPI app</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>UPI ID: <strong style={{ color: '#1A2B49', fontFamily: 'var(--font-mono)' }}>{upiSettings?.upi_id || 'Not configured'}</strong></div>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Merchant Name: <strong>{upiSettings?.upi_name || 'Not set'}</strong></div>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Status: <Badge variant={upiSettings?.upi_enabled ? 'success' : 'secondary'} style={{ fontSize: '0.65rem' }}>{upiSettings?.upi_enabled ? 'Enabled' : 'Disabled'}</Badge></div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <Button variant="outline" size="sm" icon={Settings} fullWidth onClick={() => navigate('/business/upi')}>
                Configure UPI
              </Button>
              <Button variant="primary" size="sm" icon={QrCode} fullWidth onClick={() => navigate('/business/qr')}>
                View QR
              </Button>
            </div>
          </div>
          {/* Cash */}
          <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Banknote size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>Cash</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>In-person cash payments</div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Always available for in-store payments</div>
            <div style={{ marginTop: '1rem' }}>
              <Badge variant="success" style={{ fontSize: '0.7rem' }}>Enabled</Badge>
            </div>
          </div>
          {/* Card/Online */}
          <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Smartphone size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>Card / Online</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Razorpay Test Mode</div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Card, Netbanking, Wallets via Razorpay</div>
            <div style={{ marginTop: '1rem' }}>
              <Badge variant="secondary" style={{ fontSize: '0.7rem' }}>Test Mode</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Payments Table */}
      {loading ? (
        <LoadingState message="Loading payment transactions..." />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payments found"
          description="Payment transactions will appear here once orders are paid or subscriptions are billed."
        />
      ) : (
        <Table
          columns={columns}
          data={payments}
          onRowClick={(row) => setSelectedPayment(row)}
        />
      )}

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <div className="modal-overlay" onClick={() => setSelectedPayment(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '2rem', maxWidth: '560px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>Payment Details</h3>
              <button onClick={() => setSelectedPayment(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94A3B8' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Payment ID</label>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: '#1A2B49' }}>{selectedPayment.payment_id || selectedPayment.id}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Status</label>
                <div>{getStatusBadge(selectedPayment.status)}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Amount</label>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49' }}>₹{Number(selectedPayment.amount || 0).toFixed(2)}</div>
                {Number(selectedPayment.commission_amount || 0) > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                    Fee: ₹{Number(selectedPayment.commission_amount).toFixed(2)} • Net: ₹{Number(selectedPayment.net_amount || (selectedPayment.amount - selectedPayment.commission_amount)).toFixed(2)}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Mode</label>
                <div style={{ fontWeight: 600 }}>{selectedPayment.mode || 'UPI'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Date</label>
                <div style={{ fontSize: '0.9rem', color: '#1A2B49' }}>{new Date(selectedPayment.created_at).toLocaleString()}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Order / Ref</label>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#64748B' }}>{selectedPayment.order_id || selectedPayment.transaction_reference || selectedPayment.order_ref || '-'}</div>
              </div>
            </div>

            {selectedPayment.plan_id && (
              <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Zap size={18} style={{ color: '#8B5CF6' }} />
                  <strong style={{ color: '#8B5CF6' }}>Subscription Payment</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: '#64748B' }}>Plan:</span> <strong>{selectedPayment.plan_id}</strong></div>
                  <div><span style={{ color: '#64748B' }}>Interval:</span> <strong>{selectedPayment.billing_interval || 'monthly'}</strong></div>
                  <div><span style={{ color: '#64748B' }}>UPI ID:</span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedPayment.upi_id || 'Platform UPI'}</strong></div>
                </div>
              </div>
            )}

            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1A2B49', margin: '0 0 0.75rem' }}>Customer Details</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                <div><span style={{ color: '#64748B' }}>Name:</span> <strong>{selectedPayment.customer_name || 'Walk-in Customer'}</strong></div>
                <div><span style={{ color: '#64748B' }}>Phone:</span> <strong>{selectedPayment.customer_phone || '-'}</strong></div>
                <div><span style={{ color: '#64748B' }}>Email:</span> <strong>{selectedPayment.customer_email || '-'}</strong></div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={() => setSelectedPayment(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};