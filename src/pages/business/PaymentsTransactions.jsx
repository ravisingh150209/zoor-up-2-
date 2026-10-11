import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  AlertCircle,
  CheckCircle2,
  Copy,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
const PAGE_SIZE = 15;

export const PaymentsTransactions = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [payments, setPayments] = useState([]);
  const [backendSummary, setBackendSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modeFilter, setModeFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState(null);

  // UPI settings state
  const [upiSettings, setUpiSettings] = useState(null);
  const [upiLoading, setUpiLoading] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [upiForm, setUpiForm] = useState({ upi_id: '', upi_name: '', upi_notes: 'ZOOR UP Store Payment' });
  const [upiSaving, setUpiSaving] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const bizId = user?.business_id;

  useEffect(() => {
    loadPayments();
    loadUpiSettings();
  }, [bizId, statusFilter, modeFilter, search, dateFrom, dateTo, sortBy, sortDir]);

  const loadUpiSettings = async () => {
    if (!bizId) return;
    setUpiLoading(true);
    try {
      const data = await businessService.getBusinessUpi(bizId);
      if (data) {
        setUpiSettings(data);
        setUpiForm({
          upi_id: data.upi_id || '',
          upi_name: data.upi_name || user?.business_name || '',
          upi_notes: data.upi_notes || 'ZOOR UP Store Payment',
        });
      }
    } catch (e) {
      console.error('Failed to load UPI settings:', e);
    } finally {
      setUpiLoading(false);
    }
  };

  const handleSaveUpi = async (e) => {
    e?.preventDefault();
    if (!bizId) return;

    const cleanUpi = (upiForm.upi_id || '').trim();
    if (cleanUpi) {
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$/;
      if (!upiRegex.test(cleanUpi)) {
        addToast('Invalid UPI ID format. Structure must be handle@provider (e.g. store@okaxis, 9817400078@ybl)', 'error');
        return;
      }
    }

    setUpiSaving(true);
    try {
      const data = await businessService.updateBusinessUpi(bizId, {
        upi_id: cleanUpi,
        upi_name: (upiForm.upi_name || user?.business_name || 'Store').trim(),
        upi_notes: (upiForm.upi_notes || 'ZOOR UP Store Payment').trim(),
        upi_enabled: Boolean(cleanUpi),
      });
      if (data) setUpiSettings(data);
      addToast(cleanUpi ? 'Store UPI settings saved successfully!' : 'Store UPI disabled', 'success');
      setShowUpiModal(false);
      loadUpiSettings();
    } catch (err) {
      addToast(err.message || 'Failed to save UPI settings', 'error');
    } finally {
      setUpiSaving(false);
    }
  };

  const loadPayments = async () => {
    if (!bizId) return;
    setLoading(true);
    try {
      const res = await paymentService.getPayments(bizId, {
        status: statusFilter,
        mode: modeFilter,
        search,
        date_from: dateFrom,
        date_to: dateTo,
        sort_by: sortBy,
        sort_dir: sortDir,
      });

      const list = Array.isArray(res) ? res : (res?.payments || []);
      setPayments(list);
      if (res?.summary) {
        setBackendSummary(res.summary);
      }
      setCurrentPage(1);
    } catch (e) {
      console.error('Failed to load payments:', e);
      addToast('Failed to load payment transactions', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Authoritative fallback summary calculation
  const summary = useMemo(() => {
    if (backendSummary) return backendSummary;

    let totalRev = 0;
    let pendingAmt = 0;
    let subRev = 0;

    payments.forEach((p) => {
      const amt = Number(p.amount || 0);
      const st = (p.status || '').toLowerCase().trim();
      const isSub = Boolean(p.is_subscription || p.payment_type === 'BUSINESS_SUBSCRIPTION' || (p.plan_id && !p.order_id));

      if (['paid', 'completed'].includes(st)) {
        if (isSub) {
          subRev += amt;
        } else {
          totalRev += amt;
        }
      } else if (st === 'pending') {
        pendingAmt += amt;
      }
    });

    return {
      total_revenue: totalRev,
      pending_payments: pendingAmt,
      subscription_revenue: subRev,
      total_transactions: payments.length,
    };
  }, [payments, backendSummary]);

  // Pagination calculation
  const totalPages = Math.ceil(payments.length / PAGE_SIZE) || 1;
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return payments.slice(start, start + PAGE_SIZE);
  }, [payments, currentPage]);

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
          fontWeight: 600,
        }}
      >
        {status?.charAt(0).toUpperCase() + status?.slice(1).toLowerCase()}
      </Badge>
    );
  };

  const handleExport = () => {
    if (!payments || payments.length === 0) {
      addToast('No payment transactions to export.', 'info');
      return;
    }

    const headers = [
      'Payment ID',
      'Date & Time',
      'Purpose',
      'Order / Reference',
      'Payer / Customer',
      'Phone',
      'Mode',
      'Status',
      'Amount (INR)',
    ];

    const rows = payments.map((p) => [
      `"${p.payment_id || p.id || ''}"`,
      `"${p.created_at ? new Date(p.created_at).toLocaleString() : ''}"`,
      `"${p.purpose || (p.is_subscription ? 'Subscription' : 'Customer Order')}"`,
      `"${p.order_id || p.transaction_reference || p.order_ref || ''}"`,
      `"${p.customer_name || 'Walk-in'}"`,
      `"${p.customer_phone || ''}"`,
      `"${p.mode || 'UPI'}"`,
      `"${(p.status || '').toUpperCase()}"`,
      Number(p.amount || 0).toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `zoor_up_payments_${bizId || 'store'}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast(`Exported ${payments.length} transactions to CSV`, 'success');
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
        <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: '#334155' }}>
          {val ? new Date(val).toLocaleString() : '-'}
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
          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#1A2B49' }}>
            {val || row.id}
          </strong>
          {row.is_subscription && (
            <Badge style={{ marginLeft: '6px', fontSize: '0.65rem', background: '#EDE9FE', color: '#7C3AED' }}>
              Subscription
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Purpose',
      accessor: 'purpose',
      render: (val, row) => (
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: row.is_subscription ? '#7C3AED' : '#0284C7' }}>
          {val || (row.is_subscription ? `${(row.plan_name || row.plan_id || 'Plan').toUpperCase()} Plan` : `Order #${row.order_id || '-'}`)}
        </span>
      ),
    },
    {
      header: 'Customer / Payer',
      accessor: 'customer_name',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{val || 'Walk-in Customer'}</div>
          {row.customer_phone && (
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{row.customer_phone}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Mode',
      accessor: 'mode',
      render: (val, row) => (
        <Badge variant="secondary" style={{ fontSize: '0.7rem' }}>
          {val || (row.payment_method === 'RAZORPAY' ? 'ONLINE' : 'UPI')}
        </Badge>
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
        <strong style={{ fontSize: '0.95rem', color: '#1A2B49' }}>
          ₹{Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </strong>
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

  const storeUpiUri = upiSettings?.upi_id
    ? `upi://pay?pa=${upiSettings.upi_id}&pn=${encodeURIComponent(upiSettings.upi_name || user?.business_name || 'Store')}&cu=INR&tn=${encodeURIComponent(upiSettings.upi_notes || 'ZOOR UP Store Payment')}`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#1A2B49' }}>
            Payments & Transactions
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Authoritative financial records for this store, including customer orders and business subscription billing.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" icon={RefreshCw} onClick={loadPayments} loading={loading}>
            Refresh
          </Button>
          <Button variant="outline" icon={Download} onClick={handleExport} disabled={payments.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Total Order Revenue</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1A2B49' }}>
                ₹{Number(summary.total_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#10B981', marginTop: '2px' }}>
                ✓ Completed customer orders
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Pending Payments</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1A2B49' }}>
                ₹{Number(summary.pending_payments || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#D97706', marginTop: '2px' }}>
                ⏳ Awaiting payment verification
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
                ₹{Number(summary.subscription_revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#9333EA', marginTop: '2px' }}>
                💼 Kept separate from order revenue
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Total Transactions</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1A2B49' }}>
                {summary.total_transactions || 0}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                Deduplicated store records
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Payment Methods & Store UPI Configuration */}
      <Card style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>Payment Gateway & Channels</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0' }}>Configure channels through which your customers and store make payments.</p>
          </div>
          <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>RAZORPAY TEST MODE ACTIVE</Badge>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {/* Channel 1: UPI / QR Code */}
          <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <QrCode size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1A2B49' }}>UPI / QR Code</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>In-store direct UPI scan</div>
                </div>
              </div>
              <Badge variant={upiSettings?.upi_id ? 'success' : 'secondary'} style={{ fontSize: '0.7rem' }}>
                {upiSettings?.upi_id ? 'ENABLED' : 'DISABLED'}
              </Badge>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#475569', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div>
                <span style={{ color: '#64748B' }}>Store UPI ID: </span>
                {upiSettings?.upi_id ? (
                  <strong style={{ fontFamily: 'var(--font-mono)', color: '#0F172A' }}>{upiSettings.upi_id}</strong>
                ) : (
                  <span style={{ color: '#DC2626', fontWeight: 600 }}>Not configured yet</span>
                )}
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Payee Name: </span>
                <strong>{upiSettings?.upi_name || user?.business_name || 'Store'}</strong>
              </div>
              {!upiSettings?.upi_id && (
                <div style={{ marginTop: '0.25rem', padding: '0.4rem', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', fontSize: '0.75rem', color: '#991B1B' }}>
                  ⚠️ Configure your store UPI ID to accept QR payments.
                </div>
              )}
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <Button
                variant="outline"
                size="sm"
                icon={Settings}
                fullWidth
                onClick={() => setShowUpiModal(true)}
              >
                Configure UPI
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={QrCode}
                fullWidth
                disabled={!upiSettings?.upi_id}
                onClick={() => {
                  if (!upiSettings?.upi_id) {
                    addToast('Please configure a valid UPI ID before viewing QR.', 'error');
                    return;
                  }
                  setShowQrModal(true);
                }}
              >
                View QR
              </Button>
            </div>
          </div>

          {/* Channel 2: Cash */}
          <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Banknote size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1A2B49' }}>Cash Payments</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Over-the-counter payments</div>
                </div>
              </div>
              <Badge variant="success" style={{ fontSize: '0.7rem' }}>ENABLED</Badge>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, flex: 1 }}>
              Always enabled for dine-in and take-away counter transactions. Recorded in real-time in billing.
            </p>
            <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748B' }}>
              ✓ Fully tracked in transaction table
            </div>
          </div>

          {/* Channel 3: Razorpay Cards / Online */}
          <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Smartphone size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1A2B49' }}>Razorpay Online</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Cards, UPI, Netbanking & Wallets</div>
                </div>
              </div>
              <Badge variant="secondary" style={{ fontSize: '0.7rem' }}>TEST MODE</Badge>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, flex: 1 }}>
              Official merchant gateway integrated with zero secret exposure. Powers customer checkout and business subscriptions.
            </p>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>✓ Reused across Orders & Subs</span>
              <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => navigate('/business/subscription')}>
                Plans
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card style={{ padding: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <Input
            placeholder="Search ID, order, customer, plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={16} />}
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Status' },
              { value: 'paid', label: 'Paid' },
              { value: 'completed', label: 'Completed' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <Select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Modes' },
              ...PAYMENT_MODES.map((m) => ({ value: m, label: m })),
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

      {/* Transaction Table */}
      {loading ? (
        <LoadingState message="Loading payment transactions..." />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No transactions found"
          description={
            search || statusFilter !== 'ALL' || modeFilter !== 'ALL' || dateFrom || dateTo
              ? 'No payment records match your selected filters. Try clearing or expanding your criteria.'
              : 'Payment transactions will appear here as customer orders are placed or subscription billing occurs.'
          }
        />
      ) : (
        <>
          <Table
            columns={columns}
            data={paginatedPayments}
            onRowClick={(row) => setSelectedPayment(row)}
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
              <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, payments.length)} of {payments.length} transactions
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={ChevronLeft}
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1A2B49' }}>
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  icon={ChevronRight}
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Configure Store UPI Modal */}
      {showUpiModal && (
        <div className="modal-overlay" onClick={() => !upiSaving && setShowUpiModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '2rem', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <QrCode size={22} color="#059669" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>Configure Store UPI</h3>
              </div>
              <button onClick={() => setShowUpiModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94A3B8' }}>×</button>
            </div>

            <form onSubmit={handleSaveUpi} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Store UPI ID (VPA) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <Input
                  placeholder="e.g. yourstore@okaxis or 9817400078@ybl"
                  value={upiForm.upi_id}
                  onChange={(e) => setUpiForm({ ...upiForm, upi_id: e.target.value })}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                  Valid handle@provider from Google Pay, PhonePe, Paytm, or BHIM.
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Merchant / Payee Name
                </label>
                <Input
                  placeholder="e.g. Cafe Delight"
                  value={upiForm.upi_name}
                  onChange={(e) => setUpiForm({ ...upiForm, upi_name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Transaction Note
                </label>
                <Input
                  placeholder="e.g. ZOOR UP Store Payment"
                  value={upiForm.upi_notes}
                  onChange={(e) => setUpiForm({ ...upiForm, upi_notes: e.target.value })}
                />
              </div>

              <div style={{ padding: '0.75rem', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.75rem', color: '#64748B' }}>
                🔒 Customer payments will directly deposit into this UPI bank account.
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button type="button" variant="secondary" fullWidth onClick={() => setShowUpiModal(false)} disabled={upiSaving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" fullWidth loading={upiSaving}>
                  Save & Enable UPI
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Store QR Modal */}
      {showQrModal && upiSettings?.upi_id && (
        <div className="modal-overlay" onClick={() => setShowQrModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '2rem', maxWidth: '420px', width: '100%', maxHeight: '90vh', overflow: 'auto', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
              {upiSettings.upi_name || user?.business_name || 'Store'}
            </h3>
            <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '4px 0 1.25rem' }}>
              Scan to Pay via any UPI App (GPay, PhonePe, Paytm)
            </p>

            <div style={{ display: 'inline-block', padding: '1.25rem', background: '#FFFFFF', borderRadius: '16px', border: '2px solid #E2E8F0', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', marginBottom: '1.25rem' }}>
              <QRCodeSVG value={storeUpiUri} size={220} level="M" />
            </div>

            <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '0.75rem', marginBottom: '1.25rem', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>UPI ID</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>{upiSettings.upi_id}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={copiedUpi ? CheckCircle2 : Copy}
                onClick={() => {
                  navigator.clipboard.writeText(upiSettings.upi_id);
                  setCopiedUpi(true);
                  addToast('UPI ID copied to clipboard', 'info');
                  setTimeout(() => setCopiedUpi(false), 2000);
                }}
              >
                {copiedUpi ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div style={{ padding: '0.5rem', background: '#FEF3C7', borderRadius: '8px', border: '1px solid #FDE68A', fontSize: '0.75rem', color: '#92400E', marginBottom: '1.25rem', textAlign: 'left' }}>
              ℹ️ Displaying this QR code allows customer transfers. Payments are verified through orders and bank records.
            </div>

            <Button variant="secondary" fullWidth onClick={() => setShowQrModal(false)}>
              Close
            </Button>
          </div>
        </div>
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
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Mode</label>
                <div style={{ fontWeight: 600 }}>{selectedPayment.mode || 'UPI'}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Date & Time</label>
                <div style={{ fontSize: '0.9rem', color: '#1A2B49' }}>{new Date(selectedPayment.created_at).toLocaleString()}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Order / Reference</label>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#64748B' }}>{selectedPayment.order_id || selectedPayment.transaction_reference || '-'}</div>
              </div>
            </div>

            {selectedPayment.is_subscription && (
              <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Zap size={18} style={{ color: '#8B5CF6' }} />
                  <strong style={{ color: '#8B5CF6' }}>Business Subscription Payment</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: '#64748B' }}>Plan:</span> <strong>{(selectedPayment.plan_name || selectedPayment.plan_id || 'Plan').toUpperCase()}</strong></div>
                  <div><span style={{ color: '#64748B' }}>Billing Interval:</span> <strong style={{ textTransform: 'capitalize' }}>{selectedPayment.billing_interval || 'monthly'}</strong></div>
                  <div><span style={{ color: '#64748B' }}>Gateway:</span> <strong>Razorpay (Reused Merchant Account)</strong></div>
                  <div><span style={{ color: '#64748B' }}>Order Separation:</span> <strong style={{ color: '#059669' }}>order_id: null</strong></div>
                </div>
              </div>
            )}

            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '1rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1A2B49', margin: '0 0 0.75rem' }}>
                {selectedPayment.is_subscription ? 'Business Account Details' : 'Customer Details'}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                <div><span style={{ color: '#64748B' }}>Name:</span> <strong>{selectedPayment.customer_name || 'Walk-in Customer'}</strong></div>
                <div><span style={{ color: '#64748B' }}>Phone:</span> <strong>{selectedPayment.customer_phone || '-'}</strong></div>
                {selectedPayment.razorpay_order_id && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748B' }}>Razorpay Order ID: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedPayment.razorpay_order_id}</strong>
                  </div>
                )}
                {selectedPayment.razorpay_payment_id && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748B' }}>Razorpay Payment ID: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedPayment.razorpay_payment_id}</strong>
                  </div>
                )}
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