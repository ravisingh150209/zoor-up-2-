import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
  IndianRupee,
  Layers,
  QrCode,
  Save,
  ExternalLink,
  Smartphone
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { billingService } from '../../services/billingService';
import { businessService } from '../../services/businessService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import { SearchBar, Tabs } from '../../components/ui/Controls';
import { LoadingState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const PaymentsManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [activeSection, setActiveSection] = useState('TRANSACTIONS'); // 'TRANSACTIONS' | 'UPI_SETUP'
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // UPI Settings State
  const [upiSettings, setUpiSettings] = useState({
    upi_id: '',
    upi_name: '',
    upi_notes: 'ZOOR UP Store Payment',
    upi_enabled: false,
  });
  const [savingUpi, setSavingUpi] = useState(false);
  const [previewAmount, setPreviewAmount] = useState('100');

  const bizId = user?.business_id;

  useEffect(() => {
    loadTransactions();
    loadUpiConfig();
  }, [bizId, filter, search]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await billingService.getInvoices(bizId, {
        status: filter,
        search,
      });
      setInvoices(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadUpiConfig = async () => {
    if (!bizId) return;
    try {
      const upi = await businessService.getUpiSettings(bizId);
      setUpiSettings(upi);
    } catch (e) {
      console.error('Failed to load UPI config:', e);
    }
  };

  const handleSaveUpi = async (e) => {
    e.preventDefault();
    if (!bizId) return;

    if (upiSettings.upi_id) {
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!upiRegex.test(upiSettings.upi_id.trim())) {
        addToast('Invalid UPI ID format. Structure must be name@bank or store@upi (e.g. storename@okaxis)', 'error');
        return;
      }
    }

    setSavingUpi(true);
    try {
      await businessService.saveUpiSettings(bizId, upiSettings);
      addToast('Business UPI configuration saved successfully!', 'success');
      loadUpiConfig();
    } catch (err) {
      addToast(err.message || 'Error saving UPI settings', 'error');
    } finally {
      setSavingUpi(false);
    }
  };

  const handleConfirmPayment = async (invoiceId) => {
    try {
      await billingService.updateInvoiceStatus(invoiceId, 'PAID');
      addToast(`Transaction ${invoiceId} confirmed as PAID! Loyalty points credited.`, 'success');
      loadTransactions();
    } catch (e) {
      addToast('Error confirming payment', 'error');
    }
  };

  const handleSimulateRefund = async (invoiceId) => {
    try {
      await billingService.updateInvoiceStatus(invoiceId, 'REFUNDED');
      addToast(`Initiated Razorpay reversal for ${invoiceId}. Status: REFUNDED`, 'info');
      loadTransactions();
    } catch (e) {
      addToast('Error processing refund', 'error');
    }
  };

  const upiPayUrl = upiSettings.upi_id
    ? businessService.generateUpiPaymentUrl({
        upi_id: upiSettings.upi_id,
        upi_name: upiSettings.upi_name || user?.name || 'Store Merchant',
        amount: previewAmount || '0',
        note: upiSettings.upi_notes || 'ZOOR UP Store Payment',
      })
    : '';

  const columns = [
    {
      header: 'Transaction / Order Ref',
      accessor: 'id',
      render: (id, row) => (
        <div>
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-400)' }}>
            TXN-RZP-{id.replace('INV-', '')}
          </strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Linked to {id}
          </div>
        </div>
      ),
    },
    {
      header: 'Payer',
      accessor: 'customer_name',
      render: (name, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{row.customer_phone}</div>
        </div>
      ),
    },
    {
      header: 'Method',
      accessor: 'payment_mode',
      render: (mode) => (
        <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>
          {mode || 'UPI / QR'}
        </span>
      ),
    },
    {
      header: 'Gross Amount',
      accessor: 'total_amount',
      render: (amt) => (
        <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>₹{amt}</strong>
      ),
    },
    {
      header: 'Gateway Status',
      accessor: 'payment_status',
      render: (status) => {
        if (status === 'PAID') return <Badge variant="success" icon={CheckCircle2}>Captured</Badge>;
        if (status === 'REFUNDED') return <Badge variant="warning" icon={RefreshCw}>Refunded</Badge>;
        return <Badge variant="danger" icon={AlertCircle}>Pending / Failed</Badge>;
      },
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      render: (id, row) => (
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          {row.payment_status !== 'PAID' && row.payment_status !== 'REFUNDED' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleConfirmPayment(id)}
              style={{ fontSize: '0.75rem', padding: '2px 8px', minHeight: '30px', background: '#16A34A' }}
            >
              Confirm Paid
            </Button>
          )}
          {row.payment_status === 'PAID' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSimulateRefund(id)}
              style={{ fontSize: '0.75rem', padding: '2px 8px', minHeight: '30px' }}
            >
              Refund
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Payments & Gateways</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Direct UPI collections, customer billing, and payment QR configuration.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Badge variant="success" icon={ShieldCheck}>
            Bank Grade 256-Bit Secure
          </Badge>
          {upiSettings.upi_enabled && (
            <Badge style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
              UPI Enabled
            </Badge>
          )}
        </div>
      </div>

      {/* Top Module Switcher Tabs */}
      <Tabs
        activeTab={activeSection}
        onChange={setActiveSection}
        tabs={[
          { id: 'TRANSACTIONS', label: 'Captured Transactions' },
          { id: 'UPI_SETUP', label: 'UPI & Payments Setup' },
        ]}
      />

      {activeSection === 'UPI_SETUP' ? (
        /* =================================================================
           UPI SETTINGS TAB
           ================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div
            className="card"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '1.5rem',
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
            }}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
              Configure Store UPI Settings
            </h3>
            <p style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Enable direct UPI payments for your customers on mobile. Customers can scan your store QR or tap "Pay via UPI" to pay directly into your merchant bank account without gateway commissions.
            </p>

            <form onSubmit={handleSaveUpi} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '600px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Business UPI ID <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. storename@okaxis or yourbiz@upi"
                  value={upiSettings.upi_id}
                  onChange={(e) => setUpiSettings({ ...upiSettings, upi_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.95rem',
                    fontFamily: 'var(--font-mono)',
                    color: '#1A2B49',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                  Standard UPI VPA address linked to your business current or savings account.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Business Payment Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mountain Brew Cafe Pvt Ltd"
                  value={upiSettings.upi_name}
                  onChange={(e) => setUpiSettings({ ...upiSettings, upi_name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.95rem',
                    color: '#1A2B49',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  Default Payment Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. ZOOR UP Store Payment"
                  value={upiSettings.upi_notes}
                  onChange={(e) => setUpiSettings({ ...upiSettings, upi_notes: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.95rem',
                    color: '#1A2B49',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button
                  type="submit"
                  variant="primary"
                  loading={savingUpi}
                  icon={Save}
                  style={{ background: '#1A2B49', color: '#FFFFFF' }}
                >
                  Save UPI Settings
                </Button>
              </div>
            </form>
          </div>

          {/* UPI Live Preview & QR Generator */}
          {upiSettings.upi_id && (
            <div
              className="card"
              style={{
                background: '#FAFAFB',
                border: '1.5px solid #E2E8F0',
                borderRadius: '16px',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
                Payment Preview & Store QR
              </h3>
              <p style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                This is how customers will see and scan your business UPI details.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'center' }}>
                {/* QR Display */}
                <div
                  style={{
                    background: '#FFFFFF',
                    padding: '16px',
                    borderRadius: '16px',
                    border: '1px solid #CBD5E1',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                    textAlign: 'center',
                  }}
                >
                  <QRCodeSVG value={upiPayUrl} size={150} level="M" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1A2B49', display: 'block', marginTop: '8px' }}>
                    SCAN WITH ANY UPI APP
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#64748B' }}>
                    GPay • PhonePe • Paytm • BHIM
                  </span>
                </div>

                {/* Details & Intent Link Tester */}
                <div style={{ flex: 1, minWidth: '260px' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Configured VPA</div>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', color: '#1A2B49' }}>
                      {upiSettings.upi_id}
                    </strong>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>
                      Test Amount (₹)
                    </label>
                    <input
                      type="number"
                      value={previewAmount}
                      onChange={(e) => setPreviewAmount(e.target.value)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.9rem',
                        width: '120px',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <a
                      href={upiPayUrl}
                      className="btn btn-outline"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        textDecoration: 'none',
                        color: '#1A2B49',
                        borderColor: '#CBD5E1',
                      }}
                    >
                      <Smartphone size={16} /> Test Mobile Intent
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* =================================================================
           TRANSACTIONS TAB
           ================================================================= */
        <>
          {/* Gateway Architecture Notice */}
          <div
            className="card"
            style={{
              background: '#E0F2FE',
              border: '1px solid #BAE6FD',
              padding: '1rem 1.25rem',
              fontSize: '0.85rem',
              color: '#075985',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <ShieldCheck size={28} style={{ color: '#075985', flexShrink: 0 }} />
            <div>
              <strong style={{ color: '#075985' }}>Secure Payment Orchestration:</strong> Front-end passes transaction IDs strictly to verified backend edge functions. Private API keys and merchant webhooks are kept isolated in server environments.
            </div>
          </div>

          <Tabs
            activeTab={filter}
            onChange={setFilter}
            tabs={[
              { id: 'ALL', label: 'All Transactions' },
              { id: 'PAID', label: 'Captured' },
              { id: 'UNPAID', label: 'Pending' },
            ]}
          />

          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Filter transactions by ref, customer name..."
          />

          {loading ? (
            <LoadingState message="Loading payment transactions..." />
          ) : (
            <Table columns={columns} data={invoices} />
          )}
        </>
      )}
    </div>
  );
};
