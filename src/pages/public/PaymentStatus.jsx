import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Copy,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { billingService } from '../../services/billingService';
import { businessService } from '../../services/businessService';
import { orderService } from '../../services/orderService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';

export const PaymentStatus = () => {
  const { orderId, txnId } = useParams();
  const idToLoad = txnId || orderId;
  const { addToast } = useToast();

  const [invoice, setInvoice] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);

  useEffect(() => {
    loadTransactionData();
  }, [idToLoad]);

  // Real-time status polling while payment is pending
  useEffect(() => {
    if (!invoice || invoice.payment_status === 'PAID') return;
    const interval = setInterval(() => {
      loadTransactionData(false);
    }, 3500);
    return () => clearInterval(interval);
  }, [invoice?.payment_status, idToLoad]);

  const loadTransactionData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      if (!idToLoad) {
        setError('No payment reference was provided.');
        return;
      }

      let inv = null;
      let bizId = null;
      const isPaymentId = idToLoad.startsWith('pay_');

      // 1. If payment_id, fetch payment record
      if (isPaymentId) {
        try {
          const payment = await orderService.getPaymentById(idToLoad);
          if (payment && (payment.payment_id || payment.id)) {
            const ordId = payment.order_id;
            try {
              const ord = await orderService.getOrderById(ordId);
              if (ord && (ord.id || ord.order_id)) {
                inv = {
                  id: ord.invoice_id || ord.id || ord.order_id,
                  order_id: ord.id || ord.order_id,
                  business_id: ord.business_id,
                  customer_name: ord.customer_name,
                  customer_phone: ord.customer_phone,
                  items: ord.items || [],
                  total_amount: payment.amount || ord.total || ord.total_amount || ord.subtotal || 0,
                  payment_mode: ord.payment_method || (payment.payment_method || 'UPI'),
                  payment_status: payment.status === 'pending' ? 'PENDING' : payment.status === 'paid' ? 'PAID' : payment.status.toUpperCase(),
                  order_type: ord.order_type || 'DINE_IN',
                  table_number: ord.table_number || null,
                  upi_uri: payment.upi_uri,
                  upi_id: payment.upi_id,
                  verified: payment.verified,
                };
                bizId = ord.business_id;
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      // 2. Try authoritative Order API first (for order_id references)
      if (!inv) {
        try {
          const ord = await orderService.getOrderById(idToLoad);
          if (ord && (ord.id || ord.order_id)) {
            inv = {
              id: ord.invoice_id || ord.id || ord.order_id,
              order_id: ord.id || ord.order_id,
              business_id: ord.business_id,
              customer_name: ord.customer_name,
              customer_phone: ord.customer_phone,
              items: ord.items || [],
              total_amount: ord.total || ord.total_amount || ord.subtotal || 0,
              payment_mode: ord.payment_method || 'UPI',
              payment_status: ord.payment_status || 'PENDING',
              order_type: ord.order_type || 'DINE_IN',
              table_number: ord.table_number || null,
            };
            bizId = ord.business_id;
          }
        } catch (_) {}
      }

      // 3. Fallback to Billing Invoices API
      if (!inv) {
        try {
          const allInvoices = await billingService.getInvoices();
          const found = allInvoices.find((i) => i.id === idToLoad || i.order_id === idToLoad);
          if (found) {
            inv = found;
            bizId = found.business_id;
          }
        } catch (_) {}
      }

      if (!inv) {
        setError('This payment reference has no server-side payment record.');
        return;
      }

      setInvoice(inv);
      if (bizId) {
        let b = await businessService.getBusiness(bizId);
        try {
          const upiData = await businessService.getPublicBusinessUpi(bizId);
          if (upiData?.upi_id) {
            b = {
              ...b,
              upi_id: upiData.upi_id,
              upi_name: upiData.upi_name || b?.name,
              upi_notes: upiData.upi_notes || 'ZOOR UP Store Payment',
            };
          }
        } catch (_) {}
        setBusiness(b);
      }

      if (inv.payment_status === 'PAID') {
        try {
          confetti({ particleCount: 70, spread: 70, origin: { y: 0.5 } });
        } catch (e) {}
      }
    } catch (err) {
      setError(err.message || 'Payment status could not be loaded from the server.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const copyUpiId = (id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedUpi(true);
      addToast('Business UPI ID copied to clipboard', 'info');
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  const upiId = (invoice?.upi_id || business?.upi_id || '').trim();
  const upiName = (business?.upi_name || business?.name || 'Local Store').trim();
  const amount = Number(invoice?.total_amount || invoice?.total || 0).toFixed(2);
  const txnRef = invoice?.order_id || invoice?.id || 'TXN';

  const formatUpiVpa = (vpa) => {
    if (!vpa) return '';
    const trimmed = vpa.trim();
    const parts = trimmed.split('@');
    if (parts.length === 2) {
      return `${encodeURIComponent(parts[0])}@${encodeURIComponent(parts[1])}`;
    }
    return encodeURIComponent(trimmed);
  };

  // Construct safe UPI payment URI strictly matching store settings
  const paymentUpiUri = (invoice?.upi_uri || '').trim();
  const upiIntentUri = paymentUpiUri || (upiId
    ? `upi://pay?pa=${formatUpiVpa(upiId)}&pn=${encodeURIComponent(upiName)}&am=${encodeURIComponent(amount)}&cu=INR&tn=${encodeURIComponent('Order ' + txnRef)}&tr=${encodeURIComponent(txnRef)}`
    : null);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAFAFB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '520px',
          width: '100%',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '20px',
          padding: '2rem 1.75rem',
          boxShadow: '0 8px 30px rgba(26, 43, 73, 0.06)',
          textAlign: 'center',
        }}
      >
        {/* Status Icon */}
        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: invoice?.payment_status === 'PAID' ? '#DCFCE7' : '#FEF3C7',
            color: invoice?.payment_status === 'PAID' ? '#16A34A' : '#D97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
        >
          {invoice?.payment_status === 'PAID' ? <CheckCircle2 size={38} /> : <Clock size={38} />}
        </div>

        {/* Title */}
        <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', margin: '0 0 0.35rem' }}>
          {error
            ? 'Payment Record Unavailable'
            : invoice?.payment_status === 'PAID'
            ? 'Payment Verified & Confirmed!'
            : 'Order Placed — Payment Pending Verification'}
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 1.5rem' }}>
          {error || (invoice?.payment_status === 'PAID'
            ? 'Thank you! Your transaction is complete and verified.'
            : invoice?.payment_mode === 'CASH'
            ? 'Please pay cash at the store counter. The merchant will confirm your purchase.'
            : 'Scan the store UPI QR code below or open your UPI app to complete payment.')}
        </p>

        {/* Transaction Card */}
        {invoice && (
          <div
            style={{
              background: '#FAFAFB',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748B' }}>Store / Merchant:</span>
              <strong style={{ color: '#1A2B49' }}>{business?.name || 'Local Partner Store'}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748B' }}>Order / Ref:</span>
              <strong style={{ fontFamily: 'monospace', color: '#1A2B49' }}>{invoice.id}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748B' }}>Amount Payable:</span>
              <strong style={{ fontSize: '1.15rem', color: '#1A2B49' }}>₹{invoice.total_amount}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748B' }}>Service:</span>
              <strong style={{ color: '#1A2B49' }}>
                {invoice.order_type === 'DINE_IN'
                  ? `Dine-in (Table ${invoice.table_number || 'Reserved'})`
                  : invoice.order_type === 'TAKEAWAY'
                  ? 'Takeaway / Pickup'
                  : 'In-Store'}
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748B' }}>Payment Method:</span>
              <Badge variant="secondary">{invoice.payment_mode}</Badge>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748B' }}>Verification Status:</span>
              <Badge variant={invoice.payment_status === 'PAID' ? 'success' : invoice.payment_status === 'FAILED' ? 'error' : 'warning'}>
                {invoice.payment_status === 'PAID' ? 'PAID / VERIFIED' : invoice.payment_status === 'FAILED' ? 'PAYMENT FAILED' : 'AWAITING PAYMENT / VERIFICATION'}
              </Badge>
            </div>

            {invoice.payment_status === 'PAID' ? (
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem', color: '#16A34A', fontWeight: 600 }}>
                🎉 +{Math.floor(invoice.total_amount / 10)} Loyalty Points Awarded!
              </div>
            ) : (
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem', color: '#059669', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
                <span>Automatic payment verification active. Status updates in real-time upon authentic confirmation.</span>
              </div>
            )}
          </div>
        )}



        {/* UPI QR & Intent (Only when method is UPI and not yet PAID) */}
        {invoice?.payment_mode === 'UPI' && invoice?.payment_status !== 'PAID' && (
          <div
            style={{
              border: '1px solid #BBF7D0',
              borderRadius: '16px',
              padding: '1.25rem',
              background: '#FFFFFF',
              marginBottom: '1.5rem',
            }}
          >
            {upiIntentUri ? (
              <>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669', display: 'block', marginBottom: '0.75rem' }}>
                  SCAN TO PAY VIA ANY UPI APP
                </span>

                <div
                  style={{
                    display: 'inline-block',
                    padding: '12px',
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '2px solid #E2E8F0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                    marginBottom: '0.75rem',
                  }}
                >
                  <QRCodeSVG value={upiIntentUri} size={180} level="M" />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    background: '#F8FAFC',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    marginBottom: '0.85rem',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Store UPI ID</div>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#1A2B49' }}>{upiId}</strong>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={copiedUpi ? CheckCircle2 : Copy}
                    onClick={() => copyUpiId(upiId)}
                  >
                    {copiedUpi ? 'Copied' : 'Copy ID'}
                  </Button>
                </div>

                {/* Mobile UPI Intent Button */}
                <div>
                  <a
                    href={upiIntentUri}
                    onClick={() => {
                      if (upiIntentUri) {
                        try {
                          window.location.href = upiIntentUri;
                        } catch (_) {}
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: '10px',
                      background: '#059669',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      textDecoration: 'none',
                      fontSize: '0.9rem',
                    }}
                  >
                    <Smartphone size={18} />
                    <span>Pay in UPI App (GPay / PhonePe / Paytm)</span>
                  </a>
                  <p style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px' }}>
                    Tap above on mobile to launch your installed UPI app. If it does not open, copy the Store UPI ID above or scan the QR code.
                  </p>
                </div>
              </>
            ) : (
              <div style={{ padding: '0.75rem', background: '#FFFBEB', borderRadius: '10px', color: '#B45309', fontSize: '0.85rem' }}>
                ⚠️ <strong>UPI Not Configured:</strong> This merchant has not configured their UPI ID yet. Please pay with Cash at the counter.
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <Button variant="outline" icon={RefreshCw} onClick={loadTransactionData} loading={loading}>
            Refresh Status
          </Button>
          {business?.slug && (
            <Link to={`/m/${business.slug}`} className="btn btn-secondary btn-block">
              Back to Store Menu
            </Link>
          )}
          <Link to="/customer" className="btn btn-ghost btn-block">
            Go to Customer Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export const OrderSuccess = PaymentStatus;
export default PaymentStatus;