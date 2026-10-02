import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  Receipt
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { billingService } from '../../services/billingService';
import { businessService } from '../../services/businessService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import { isProductionEnvironment } from '../../services/storageSeed.js';

export const PaymentStatus = () => {
  const { orderId, txnId } = useParams();
  const idToLoad = txnId || orderId;
  const { addToast } = useToast();

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
      // Search invoice by id
      const allInvoices = await billingService.getInvoices();
      let inv = allInvoices.find((i) => i.id === idToLoad || i.order_id === idToLoad);
      if (!inv && !isProductionEnvironment()) {
        // Try fallback to localDB
        const stored = localStorage.getItem('zoorup_invoices');
        if (stored) {
          const list = JSON.parse(stored);
          inv = list.find((i) => i.id === idToLoad || i.order_id === idToLoad);
        }
      }

      if (!inv) {
        setError('This payment reference has no server-side payment record.');
        return;
      }

      if (inv) {
        setInvoice(inv);
        if (inv.business_id) {
          const b = await businessService.getBusiness(inv.business_id);
          setBusiness(b);
        }
        if (inv.payment_status === 'PAID') {
          try {
            confetti({ particleCount: 70, spread: 70, origin: { y: 0.5 } });
          } catch (e) {}
        }
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

  // UPI Payment Link
  const upiId = business?.upi_id || 'store@upi';
  const upiName = business?.name || 'Local Store';
  const amount = invoice?.total_amount || 0;
  const txnRef = invoice?.id || 'TXN-101';

  const upiIntentUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${encodeURIComponent(amount)}&cu=INR&tn=${encodeURIComponent(txnRef)}`;

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
