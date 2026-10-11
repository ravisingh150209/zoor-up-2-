import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

import { getErrorMessage } from '../../utils/errorUtils';
import {
  ShoppingBag,
  ArrowLeft,
  Banknote,
  Tag,
  CheckCircle2,
  Clock,
  Store,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Utensils,
  Package,
  Smartphone,
  Lock,
  CreditCard,
  Globe,
  Check,
  QrCode,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { billingService } from '../../services/billingService';
import { orderService } from '../../services/orderService';
import { businessService } from '../../services/businessService';
import { loyaltyService } from '../../services/loyaltyService';
import { tableBookingService } from '../../services/tableBookingService';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { notificationService, NOTIFICATION_TYPES } from '../../services/notificationService';

export const PublicCheckout = () => {
  const { items, subtotal, clearCart, businessSlug, businessId } = useCart();
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [business, setBusiness] = useState(null);
  const [upiConfig, setUpiConfig] = useState({ upi_id: '', upi_name: '', upi_notes: '', upi_enabled: false });
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('UPI'); // 'UPI' | 'CASH'
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Dining option & Table selection state
  const [orderType, setOrderType] = useState('DINE_IN'); // 'DINE_IN' | 'TAKEAWAY'
  const [tables, setTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [selectedTableNumber, setSelectedTableNumber] = useState('');
  const [customTableNumber, setCustomTableNumber] = useState('');

  useEffect(() => {
    loadBusiness();
  }, [businessSlug, businessId, items]);

  const loadBusiness = async () => {
    try {
      let b = null;
      const targetBizIdentifier = businessId || items[0]?.business_id || businessSlug;
      if (targetBizIdentifier) {
        b = await businessService.getBusinessBySlug(targetBizIdentifier);
        if (!b) {
          b = await businessService.getBusiness(targetBizIdentifier);
        }
      }
      if (b) {
        setBusiness(b);
        loadBusinessTables(b.id);

        // Load authoritative UPI configuration strictly for this business
        try {
          const upiData = await businessService.getPublicBusinessUpi(b.id);
          const hasUpi = Boolean(upiData?.upi_id && upiData?.upi_enabled !== false);
          setUpiConfig({
            upi_id: (upiData?.upi_id || '').trim(),
            upi_name: (upiData?.upi_name || b.name || 'Store').trim(),
            upi_notes: (upiData?.upi_notes || 'ZOOR UP Store Payment').trim(),
            upi_enabled: hasUpi,
          });

          if (hasUpi) {
            setPaymentMethod('UPI');
          } else {
            setPaymentMethod('CASH');
          }
        } catch (upiErr) {
          console.warn('Could not load store UPI configuration:', upiErr);
          setUpiConfig({ upi_id: '', upi_name: b.name || 'Store', upi_notes: '', upi_enabled: false });
          setPaymentMethod('CASH');
        }
      }
    } catch (e) {
      console.error('Error loading checkout business:', e);
      addToast(getErrorMessage(e) || 'Failed to load store information', 'error');
    }
  };

  const loadBusinessTables = async (bizId) => {
    try {
      const bizTables = await tableBookingService.getTables(bizId, true);
      setTables(bizTables || []);
      if (bizTables && bizTables.length > 0) {
        setSelectedTableId(bizTables[0].id);
        setSelectedTableNumber(bizTables[0].table_number);
      }
    } catch (e) {
      console.error('Error loading tables for checkout:', e);
      addToast(getErrorMessage(e) || 'Failed to load table information', 'error');
    }
  };

  const taxAmount = Math.round((subtotal * 5) / 100);
  const grandTotal = Math.max(0, subtotal + taxAmount - appliedDiscount);

  // Authoritatively construct business-specific UPI payment URI
  const storeUpiUri = upiConfig?.upi_id
    ? `upi://pay?pa=${encodeURIComponent(upiConfig.upi_id)}&pn=${encodeURIComponent(upiConfig.upi_name || business?.name || 'Store')}&am=${grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(upiConfig.upi_notes || `Order at ${business?.name || 'Store'}`)}`
    : '';

  const handleCopyUpi = () => {
    if (upiConfig?.upi_id) {
      navigator.clipboard.writeText(upiConfig.upi_id);
      setCopiedUpi(true);
      addToast('Store UPI ID copied to clipboard', 'info');
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    if (!business?.id) return;

    const res = await loyaltyService.validateCoupon(business.id, couponCode, subtotal);
    if (res.valid) {
      setAppliedDiscount(res.discountAmount);
      addToast(`Coupon "${res.offer.code}" applied! -₹${res.discountAmount}`, 'success');
    } else {
      addToast(res.error, 'error');
    }
  };

  const handlePlaceOrder = async () => {
    if (placingRef.current) return;
    if ((user?.role || '').toUpperCase() !== 'CUSTOMER') {
      addToast('Please sign in as a customer before placing an order.', 'error');
      navigate('/login/customer');
      return;
    }
    if (!business?.id) {
      addToast('The selected business could not be verified.', 'error');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      addToast('Customer Name and Mobile Number are required', 'error');
      return;
    }

    if (paymentMethod === 'UPI' && !upiConfig?.upi_id) {
      addToast('This business has not configured UPI payments yet. Please select Cash.', 'error');
      return;
    }

    let finalTableNumber = null;
    let finalTableId = null;

    if (orderType === 'DINE_IN') {
      if (tables.length > 0) {
        if (!selectedTableId) {
          addToast('Please select your dining table', 'error');
          return;
        }
        const found = tables.find((t) => t.id === selectedTableId);
        finalTableId = found?.id || selectedTableId;
        finalTableNumber = found?.table_number || selectedTableNumber;
      } else {
        if (!customTableNumber.trim()) {
          addToast('Please enter your table number', 'error');
          return;
        }
        finalTableNumber = customTableNumber.trim();
      }
    }

    placingRef.current = true;
    setPlacing(true);
    try {
      const order = await orderService.createOrder({
        business_id: business.id,
        items,
        order_type: orderType,
        table_id: finalTableId,
        table_number: finalTableNumber,
        payment_method: paymentMethod,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        coupon_code: appliedDiscount > 0 ? couponCode.trim() : undefined,
      });

      const orderRef = order.order_id || order.id || order.invoice_id;

      // Notify business of incoming in-store order
      try {
        notificationService.createNotification({
          recipient_id: order.business_id,
          business_id: order.business_id,
          type: NOTIFICATION_TYPES.PAYMENT_PENDING,
          title: `New ${paymentMethod} Order: ₹${grandTotal} (${orderType === 'DINE_IN' ? `Table ${finalTableNumber}` : 'Takeaway'})`,
          message: `${customerName.trim()} placed order ${orderRef} worth ₹${grandTotal}. Direct payment awaiting counter verification.`,
          entity_id: orderRef,
          action_url: '/business/orders',
        }).catch(() => {});
      } catch (_) {}

      clearCart();

      if (paymentMethod === 'UPI') {
        // Register direct UPI payment record with business's authoritative UPI ID
        try {
          const upiPayment = await orderService.createUpiPayment(orderRef, business.id);
          addToast('Order placed! Direct UPI payment pending store verification.', 'success');
          navigate(`/payment-status/${upiPayment?.payment_id || orderRef}`);
        } catch (upiErr) {
          console.warn('Payment record intent creation note:', upiErr);
          addToast('Order placed! Please complete UPI payment at counter.', 'info');
          navigate(`/payment-status/${orderRef}`);
        }
      } else {
        // Cash payment
        addToast('Order recorded successfully!', 'success');
        navigate(`/order-success/${orderRef}`);
      }
    } catch (e) {
      console.error(e);
      addToast(getErrorMessage(e), 'error');
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <ShoppingBag size={54} style={{ color: '#94A3B8', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1A2B49' }}>Your cart is empty</h3>
        <p style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Explore the digital storefront menu to add fresh items.
        </p>
        <Link to={businessSlug ? `/m/${businessSlug}` : '/customer'} className="btn btn-primary">
          Back to Store Menu
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: '#F1F5F9',
            border: 'none',
            borderRadius: '10px',
            padding: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={18} color="#1A2B49" />
        </button>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#1A2B49' }}>
            Checkout & Pay
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
            Ordering directly from <strong style={{ color: '#1A2B49' }}>{business?.name || 'Store'}</strong>
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Customer Details */}
        <div
          className="card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.25rem',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.75rem' }}>
            Customer Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Input
              label="Your Full Name"
              placeholder="e.g. Rahul Sharma"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
            <Input
              label="Contact Mobile Number"
              placeholder="e.g. 9817400078"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Dining Option (Dine-in vs Takeaway) */}
        <div
          className="card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.25rem',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.75rem' }}>
            Dining Option
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setOrderType('DINE_IN')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                borderRadius: '12px',
                border: orderType === 'DINE_IN' ? '2px solid #00B89C' : '1px solid #CBD5E1',
                background: orderType === 'DINE_IN' ? '#ECFDF5' : '#FFFFFF',
                color: orderType === 'DINE_IN' ? '#00B89C' : '#64748B',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Utensils size={18} />
              Dine-In
            </button>
            <button
              type="button"
              onClick={() => setOrderType('TAKEAWAY')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                borderRadius: '12px',
                border: orderType === 'TAKEAWAY' ? '2px solid #00B89C' : '1px solid #CBD5E1',
                background: orderType === 'TAKEAWAY' ? '#ECFDF5' : '#FFFFFF',
                color: orderType === 'TAKEAWAY' ? '#00B89C' : '#64748B',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Package size={18} />
              Takeaway / Pickup
            </button>
          </div>

          {orderType === 'DINE_IN' && (
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Select Table / Enter Table Marker
              </label>
              {tables.length > 0 ? (
                <select
                  value={selectedTableId}
                  onChange={(e) => {
                    setSelectedTableId(e.target.value);
                    const t = tables.find((item) => item.id === e.target.value);
                    if (t) setSelectedTableNumber(t.table_number);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.9rem',
                    background: '#FFFFFF',
                  }}
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      Table {t.table_number} ({t.seating_capacity} Seats) - {t.section || 'Main Area'}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  label=""
                  placeholder="e.g. Table 12"
                  value={customTableNumber}
                  onChange={(e) => setCustomTableNumber(e.target.value)}
                  required
                />
              )}
              <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '6px 0 0' }}>
                {tables.length > 0
                  ? 'Your order will be prepared and served directly to this table.'
                  : 'Enter the table number printed on your table marker or QR stand.'}
              </p>
            </div>
          )}
        </div>

        {/* Cart Items Summary */}
        <div
          className="card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.25rem',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.75rem' }}>
            Selected Items ({items.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {items.map((i) => (
              <div
                key={i.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                  borderBottom: '1px solid #F1F5F9',
                  paddingBottom: '0.5rem',
                }}
              >
                <div>
                  <strong style={{ color: '#1A2B49' }}>{i.name}</strong>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>
                    Qty: {i.quantity} × ₹{i.price}
                  </span>
                </div>
                <strong style={{ color: '#1A2B49' }}>₹{i.price * i.quantity}</strong>
              </div>
            ))}
          </div>

          {/* Coupon Code Input */}
          <form onSubmit={handleApplyCoupon} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <Input
              placeholder="Promo / Coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button type="submit" variant="secondary" size="sm">
              Apply
            </Button>
          </form>

          {/* Price Breakdown */}
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
              <span>Subtotal:</span>
              <span>₹{subtotal}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
              <span>Applicable Taxes & GST (5%):</span>
              <span>₹{taxAmount}</span>
            </div>
            {appliedDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A', fontWeight: 600 }}>
                <span>Coupon Discount:</span>
                <span>-₹{appliedDiscount}</span>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#1A2B49',
                fontWeight: 800,
                fontSize: '1.1rem',
                borderTop: '1px solid #E2E8F0',
                paddingTop: '0.65rem',
                marginTop: '0.25rem',
              }}
            >
              <span>Total Payable:</span>
              <span style={{ color: '#059669' }}>₹{grandTotal}</span>
            </div>
          </div>
        </div>

        {/* Business-Specific Payment Method Selection */}
        <div
          className="card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', margin: 0 }}>
              Payment Method
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Direct Merchant Settlement</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Option 1: Direct Store UPI */}
            {upiConfig?.upi_id ? (
              <div
                onClick={() => setPaymentMethod('UPI')}
                style={{
                  padding: '1.25rem',
                  borderRadius: '14px',
                  border: paymentMethod === 'UPI' ? '2.5px solid #059669' : '1.5px solid #E2E8F0',
                  background: paymentMethod === 'UPI' ? '#F0FDF4' : '#FAFAFB',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  boxShadow: paymentMethod === 'UPI' ? '0 4px 14px rgba(5, 150, 105, 0.12)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: paymentMethod === 'UPI' ? '#059669' : '#E2E8F0',
                      color: paymentMethod === 'UPI' ? '#FFFFFF' : '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <QrCode size={24} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '1rem', color: '#1A2B49' }}>
                        Pay via UPI
                      </strong>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: '#059669',
                          background: '#DCFCE7',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '999px',
                        }}
                      >
                        DIRECT TO STORE
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                      Payee: <strong>{upiConfig.upi_name || business?.name}</strong>
                    </div>
                    <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#0F172A', marginTop: '1px' }}>
                      UPI ID: <strong>{upiConfig.upi_id}</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      border: paymentMethod === 'UPI' ? '2.5px solid #059669' : '2px solid #CBD5E1',
                      background: paymentMethod === 'UPI' ? '#059669' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {paymentMethod === 'UPI' && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                  </div>
                </div>

                {/* Embedded Interactive QR & Direct App Link when UPI selected */}
                {paymentMethod === 'UPI' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: '0.5rem',
                      padding: '1.25rem',
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      border: '1px solid #BBF7D0',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669', marginBottom: '0.75rem' }}>
                      SCAN WITH ANY UPI APP OR TAP TO PAY
                    </div>

                    <div
                      style={{
                        display: 'inline-block',
                        padding: '12px',
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '2px solid #E2E8F0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                        marginBottom: '0.85rem',
                      }}
                    >
                      <QRCodeSVG value={storeUpiUri} size={180} level="M" />
                    </div>

                    {/* Copy UPI Button & Details */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 0.85rem',
                        background: '#F8FAFC',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        marginBottom: '0.75rem',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Store UPI ID</div>
                        <strong style={{ fontFamily: 'var(--font-mono)', color: '#1A2B49' }}>{upiConfig.upi_id}</strong>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        icon={copiedUpi ? CheckCircle2 : Copy}
                        onClick={handleCopyUpi}
                      >
                        {copiedUpi ? 'Copied' : 'Copy ID'}
                      </Button>
                    </div>

                    {/* Deep-link button to open installed UPI App */}
                    <a
                      href={storeUpiUri}
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
                        marginBottom: '0.5rem',
                      }}
                    >
                      <Smartphone size={18} />
                      Open in UPI App (GPay / PhonePe / Paytm)
                    </a>

                    <div style={{ padding: '0.5rem', background: '#FEF3C7', borderRadius: '8px', border: '1px solid #FDE68A', fontSize: '0.73rem', color: '#92400E', textAlign: 'left' }}>
                      ℹ️ Transfer ₹{grandTotal} directly to {upiConfig.upi_name || business?.name}. Your order will be placed with <strong>Pending Verification</strong> status until verified by the store.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* When Store Has Not Configured UPI */
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '14px',
                  border: '1.5px dashed #FCA5A5',
                  background: '#FEF2F2',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  color: '#991B1B',
                  fontSize: '0.85rem',
                }}
              >
                <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.9rem' }}>
                    This business has not configured UPI payments yet.
                  </strong>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#7F1D1D' }}>
                    Direct store UPI transfer is unavailable. Please select "Pay Cash at Counter" to complete your order.
                  </p>
                </div>
              </div>
            )}

            {/* Option 2: Pay Cash at Counter */}
            <div
              onClick={() => setPaymentMethod('CASH')}
              style={{
                padding: '1.1rem',
                borderRadius: '14px',
                border: paymentMethod === 'CASH' ? '2.5px solid #F59E0B' : '1.5px solid #E2E8F0',
                background: paymentMethod === 'CASH' ? '#FEF3C7' : '#FAFAFB',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                boxShadow: paymentMethod === 'CASH' ? '0 4px 14px rgba(245, 158, 11, 0.12)' : 'none',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: paymentMethod === 'CASH' ? '#F59E0B' : '#E2E8F0',
                  color: paymentMethod === 'CASH' ? '#FFFFFF' : '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Banknote size={24} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: '1rem', color: '#1A2B49', display: 'block' }}>
                  Pay Cash at Counter
                </strong>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0' }}>
                  Pay cash directly when you pick up or dine
                </p>
              </div>

              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  border: paymentMethod === 'CASH' ? '2.5px solid #F59E0B' : '2px solid #CBD5E1',
                  background: paymentMethod === 'CASH' ? '#F59E0B' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {paymentMethod === 'CASH' && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
              </div>
            </div>
          </div>
        </div>

        {/* Place Order Button */}
        <Button
          variant="primary"
          size="lg"
          block
          loading={placing}
          disabled={placing || (paymentMethod === 'UPI' && !upiConfig?.upi_id)}
          onClick={handlePlaceOrder}
          icon={CheckCircle2}
          style={{
            padding: '1rem',
            fontSize: '1.05rem',
            fontWeight: 800,
            background: paymentMethod === 'UPI' ? '#059669' : '#F59E0B',
            borderColor: paymentMethod === 'UPI' ? '#059669' : '#F59E0B',
          }}
        >
          {paymentMethod === 'UPI'
            ? `Place Order via Store UPI — ₹${grandTotal}`
            : `Place Cash Order — ₹${grandTotal}`}
        </Button>
      </div>
    </div>
  );
};

export default PublicCheckout;
