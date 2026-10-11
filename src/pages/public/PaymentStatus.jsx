import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../utils/errorUtils';
import {
  CheckCircle2,
  Clock,
  QrCode,
  ArrowRight,
  ExternalLink,
  Store,
  CreditCard,
  AlertCircle,
  Copy,
  Receipt,
  Smartphone,
  Lock,
  RefreshCw
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { billingService } from '../../services/billingService';
import { businessService } from '../../services/businessService';
import { orderService } from '../../services/orderService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import { isProductionEnvironment } from '../../services/storageSeed.js';

// Load Razorpay script dynamically
const loadRazorpayScript = () => {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load Razorpay script'));
    document.body.appendChild(script);
  });
};

export const PaymentStatus = () => {
  const { orderId, txnId } = useParams();
  const idToLoad = txnId || orderId;
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTransactionData();
  }, [idToLoad]);

  const loadTransactionData = async () => {
    setLoading(true);
    setError('');
    try {
      if (!idToLoad) {
        setError('No payment reference was provided.');
        return;
      }

      let inv = null;
      let bizId = null;
      const isPaymentId = idToLoad.startsWith('pay_');

      // 1. If payment_id, try payment status API first (includes Razorpay payments)
      if (isPaymentId) {
        try {
          const payment = await orderService.getPaymentById(idToLoad);
          if (payment && (payment.payment_id || payment.id)) {
            // Fetch order details using order_id from payment
            const orderId = payment.order_id;
            try {
              const ord = await orderService.getOrderById(orderId);
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
                  razorpay_order_id: payment.razorpay_order_id,
                  razorpay_payment_id: payment.razorpay_payment_id,
                  verified: payment.verified,
                };
                bizId = ord.business_id;
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      // 1b. Try Razorpay-specific payment status if we have a Razorpay order ID
      if (!inv && idToLoad.startsWith('order_')) {
        try {
          const payment = await orderService.getRazorpayPaymentStatus(idToLoad);
          if (payment) {
            const ord = await orderService.getOrderById(payment.order_id);
            if (ord) {
              inv = {
                id: ord.invoice_id || ord.id || ord.order_id,
                order_id: ord.id || ord.order_id,
                business_id: ord.business_id,
                customer_name: ord.customer_name,
                customer_phone: ord.customer_phone,
                items: ord.items || [],
                total_amount: payment.amount || ord.total || ord.total_amount || ord.subtotal || 0,
                payment_mode: 'RAZORPAY',
                payment_status: payment.status === 'paid' ? 'PAID' : payment.status.toUpperCase(),
                order_type: ord.order_type || 'DINE_IN',
                table_number: ord.table_number || null,
                razorpay_order_id: payment.razorpay_order_id,
                razorpay_payment_id: payment.razorpay_payment_id,
                verified: payment.verified,
              };
              bizId = ord.business_id;
            }
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
        const b = await businessService.getBusiness(bizId);
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
      setLoading(false);
    }
  };

  const copyUpiId = (id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id);
      addToast('Business UPI ID copied!', 'success');
    }
  };

  const [razorpayRetryLoading, setRazorpayRetryLoading] = useState(false);

  const handleRazorpayRetry = async () => {
    if (!invoice?.razorpay_order_id) return;
    setRazorpayRetryLoading(true);
    try {
      // Try to get updated payment status from backend
      const payment = await orderService.getRazorpayPaymentStatus(invoice.razorpay_order_id);
      if (payment && payment.status === 'paid') {
        addToast('Payment verified successfully!', 'success');
        // Reload the page to show updated status
        window.location.reload();
      } else if (payment && (payment.status === 'pending' || payment.status === 'created')) {
        // Payment not yet completed, offer to retry checkout
        addToast('Payment not yet completed. Opening Razorpay checkout...', 'info');
        // Reload Razorpay checkout
        await loadRazorpayScript();
        const options = {
          key: payment.razorpay_key_id || (await orderService.createRazorpayOrder(invoice.order_id, invoice.business_id))?.razorpay_key_id,
          amount: payment.amount_paise || Math.round(invoice.total_amount * 100),
          currency: 'INR',
          name: business?.name || 'ZOOR UP Store',
          description: `Order ${invoice.order_id}`,
          order_id: invoice.razorpay_order_id,
          handler: async (response) => {
            try {
              const verifyResult = await orderService.verifyRazorpayPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                order_id: invoice.order_id,
              });
              addToast('Payment verified successfully!', 'success');
              navigate(`/order-success/${invoice.order_id}`);
            } catch (verifyErr) {
              console.error('Razorpay verification failed:', verifyErr);
              addToast(getErrorMessage(verifyErr) || 'Payment verification failed', 'error');
            }
          },
          prefill: {
            name: invoice.customer_name || '',
            contact: invoice.customer_phone || '',
          },
          theme: { color: '#00B89C' },
          modal: {
            ondismiss: () => {
              addToast('Payment cancelled.', 'warning');
            },
          },
        };
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (response) => {
          console.error('Razorpay payment failed:', response.error);
          const message = getErrorMessage(response?.error || response, 'Payment failed. Please try again.');
          addToast(message, 'error');
        });
        rzp.open();
      } else {
        addToast(`Payment status: ${payment?.status || 'unknown'}`, 'info');
      }
    } catch (e) {
      console.error('Razorpay retry failed:', e);
      addToast(getErrorMessage(e) || 'Failed to check payment status', 'error');
    } finally {
      setRazorpayRetryLoading(false);
    }
  };

  // UPI Payment Link from verified business record
  // Prefer backend-generated UPI URI from payment record if available
  const upiId = (business?.upi_id || '').trim();
  const upiName = (business?.upi_name || business?.name || 'Local Store').trim();
  const amount = Number(invoice?.total_amount || invoice?.total || 0).toFixed(2);
  const txnRef = invoice?.order_id || invoice?.id || 'TXN-101';

  // Use payment record's UPI URI if available (backend-generated), otherwise generate
  const paymentUpiUri = (invoice?.upi_uri || '').trim();
  const upiIntentUri = paymentUpiUri || (upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${encodeURIComponent(amount)}&cu=INR&tn=${encodeURIComponent('Order ' + txnRef)}&tr=${encodeURIComponent(txnRef)}`
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
          {error ? 'Payment record unavailable' : invoice?.payment_status === 'PAID' ? 'Payment Verified & Confirmed!' : 'Purchase Recorded — Payment Pending'}
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 1.5rem' }}>
          {error || (invoice?.payment_status === 'PAID'
            ? 'Thank you! Your transaction is complete and verified.'
            : invoice?.payment_mode === 'CASH'
            ? 'Please pay cash at the store counter. The merchant will confirm your purchase.'
            : 'Scan the UPI QR code or open your UPI app to complete payment.')}
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
              <span style={{ color: '#64748B' }}>Invoice / Ref:</span>
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
              <span style={{ fontWeight: 600 }}>{invoice.payment_mode}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748B' }}>Verification Status:</span>
              <Badge variant={invoice.payment_status === 'PAID' ? 'success' : 'warning'}>
                {invoice.payment_status === 'PAID' ? 'PAID / VERIFIED' : 'AWAITING VERIFICATION'}
              </Badge>
            </div>

            {invoice.payment_status === 'PAID' ? (
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem', color: '#16A34A', fontWeight: 600 }}>
                🎉 +{Math.floor(invoice.total_amount / 10)} Loyalty Points Awarded!
              </div>
            ) : (
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem', color: '#D97706', fontSize: '0.78rem' }}>
                💡 +{Math.floor(invoice.total_amount / 10)} Loyalty Points will be credited once verified at counter.
              </div>
            )}
            
            {/* Razorpay Retry/Verify Button */}
            {invoice?.payment_mode === 'RAZORPAY' && invoice?.payment_status !== 'PAID' && invoice?.razorpay_order_id && (
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  block
                  onClick={handleRazorpayRetry}
                  disabled={razorpayRetryLoading}
                  icon={RefreshCw}
                  style={{ padding: '0.6rem' }}
                >
                  {razorpayRetryLoading ? 'Checking Payment Status...' : 'Check Payment Status / Retry'}
                </Button>
                <p style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '0.5rem', textAlign: 'center' }}>
                  If you completed payment but it shows pending, click above to verify.
                </p>
              </div>
            )}
          </div>
        )}

        {/* UPI QR & Intent (Only when method is UPI and not yet PAID) */}
        {invoice?.payment_mode === 'UPI' && invoice?.payment_status !== 'PAID' && (
          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '1.25rem',
              background: '#FFFFFF',
              marginBottom: '1.5rem',
            }}
          >
            {upiIntentUri ? (
              <>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#D97706', display: 'block', marginBottom: '0.75rem' }}>
                  SCAN TO PAY VIA ANY UPI APP
                </span>

                <div style={{ display: 'inline-block', padding: '12px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #CBD5E1' }}>
                  <QRCodeSVG
                    value={upiIntentUri}
                    size={180}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748B' }}>
                  <span>UPI ID: </span>
                  <strong style={{ color: '#1A2B49' }}>{upiId}</strong>
                </div>

                {/* Mobile UPI Intent Button */}
                <div style={{ marginTop: '1rem' }}>
                  <a
                    href={upiIntentUri}
                    className="btn btn-primary btn-block"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      textDecoration: 'none',
                      padding: '0.75rem',
                    }}
                  >
                    <CreditCard size={18} />
                    <span>Pay via UPI App (GPay / PhonePe / Paytm)</span>
                  </a>
                  <p style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '6px', margin: '6px 0 0' }}>
                    On Android/iOS mobile, tap above to launch your installed UPI app.
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