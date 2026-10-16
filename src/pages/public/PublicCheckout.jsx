import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  Check,
  QrCode,
  Copy,
  ExternalLink,
  RefreshCw,
  Loader2,
  Plus,
  Minus,
  Trash2,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { orderService } from '../../services/orderService';
import { businessService } from '../../services/businessService';
import { loyaltyService } from '../../services/loyaltyService';
import { tableBookingService } from '../../services/tableBookingService';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { notificationService, NOTIFICATION_TYPES } from '../../services/notificationService';

export const PublicCheckout = () => {
  const { items, subtotal, totalCount, updateQuantity, removeItem, clearCart, businessSlug, businessId, tableId: cartTableId } = useCart();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const tableFromUrl = searchParams.get('table');
  const preselectedTable = tableFromUrl || cartTableId || '';

  const [business, setBusiness] = useState(null);
  const [upiConfig, setUpiConfig] = useState({ upi_id: '', upi_name: '', upi_notes: '', upi_enabled: false });
  const [loadingUpi, setLoadingUpi] = useState(true);
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('UPI'); // 'UPI' | 'CASH'
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Synchronize customer details once authenticated session resolves
  useEffect(() => {
    if (user?.name && !customerName) setCustomerName(user.name);
    if (user?.phone && !customerPhone) setCustomerPhone(user.phone);
  }, [user]);

  // Payment states:
  // 'IDLE' | 'AWAITING_PAYMENT' | 'VERIFYING_PAYMENT' | 'PAYMENT_SUCCESSFUL' | 'PAYMENT_FAILED' | 'PAYMENT_PENDING'
  const [paymentState, setPaymentState] = useState('IDLE');
  const [paymentError, setPaymentError] = useState('');
  const [activeOrderRef, setActiveOrderRef] = useState(null);

  // Dining option & Table selection state
  const [orderType, setOrderType] = useState('DINE_IN'); // 'DINE_IN' | 'TAKEAWAY'
  const [tables, setTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [selectedTableNumber, setSelectedTableNumber] = useState('');
  const [customTableNumber, setCustomTableNumber] = useState(preselectedTable);

  // Stable business identifier: avoid triggering on items quantity updates
  const targetBizIdentifier = businessId || items[0]?.business_id || businessSlug;

  useEffect(() => {
    if (targetBizIdentifier) {
      loadBusiness(targetBizIdentifier);
    }
  }, [targetBizIdentifier]);

  const loadBusiness = async (bizIdentifier) => {
    const targetId = bizIdentifier || targetBizIdentifier;
    if (!targetId) {
      setLoadingUpi(false);
      return;
    }

    // Do not reload or re-spin if store is already loaded
    if (business && (business.id === targetId || business.slug === targetId)) {
      setLoadingUpi(false);
      return;
    }

    try {
      setLoadingUpi(true);
      let b = await businessService.getBusinessBySlug(targetId);
      if (!b) {
        b = await businessService.getBusiness(targetId);
      }
      if (b) {
        setBusiness(b);
        loadBusinessTables(b.id);

        // Read direct UPI properties already present on the business object
        const directUpiId = (b.upi_id || b.payment_settings?.upi_id || b.metadata?.upi_id || b.vpa || '').trim();
        const directUpiName = (b.upi_name || b.metadata?.upi_name || b.name || 'Store').trim();
        const directUpiNotes = (b.upi_notes || b.metadata?.upi_notes || 'ZOOR UP Store Payment').trim();
        const directUpiEnabled = Boolean(directUpiId && b.upi_enabled !== false);

        let finalUpiId = directUpiId;
        let finalUpiName = directUpiName;
        let finalUpiNotes = directUpiNotes;
        let finalUpiEnabled = directUpiEnabled;

        // Load authoritative UPI configuration strictly for this business
        try {
          const upiData = await businessService.getPublicBusinessUpi(b.id);
          if (upiData?.upi_id) {
            finalUpiId = (upiData.upi_id || '').trim();
            finalUpiName = (upiData.upi_name || b.name || 'Store').trim();
            finalUpiNotes = (upiData.upi_notes || 'ZOOR UP Store Payment').trim();
            finalUpiEnabled = Boolean(finalUpiId && upiData.upi_enabled !== false);
          }
        } catch (upiErr) {
          console.warn('Could not load authoritative store UPI endpoint, used profile settings:', upiErr);
        }

        setUpiConfig({
          upi_id: finalUpiId,
          upi_name: finalUpiName,
          upi_notes: finalUpiNotes,
          upi_enabled: finalUpiEnabled,
        });

        // Safe initial payment method without overwriting an existing user selection
        setPaymentMethod((prev) => {
          if (!finalUpiEnabled) return 'CASH';
          if (prev) return prev;
          return 'UPI';
        });
      }
    } catch (e) {
      console.error('Error loading checkout business:', e);
      addToast(getErrorMessage(e) || 'Failed to load store information', 'error');
    } finally {
      setLoadingUpi(false);
    }
  };

  const loadBusinessTables = async (bizId) => {
    try {
      const bizTables = await tableBookingService.getTables(bizId, true);
      setTables(bizTables || []);
      if (bizTables && bizTables.length > 0) {
        const found = preselectedTable
          ? bizTables.find((t) => t.id === preselectedTable || String(t.table_number) === String(preselectedTable) || t.name === preselectedTable)
          : null;
        if (found) {
          setSelectedTableId((prev) => prev || found.id);
          setSelectedTableNumber((prev) => prev || found.table_number || found.name);
        } else if (preselectedTable) {
          setSelectedTableId((prev) => prev || '__CUSTOM__');
          setSelectedTableNumber((prev) => prev || preselectedTable);
          setCustomTableNumber((prev) => prev || preselectedTable);
        } else {
          setSelectedTableId((prev) => prev || bizTables[0].id);
          setSelectedTableNumber((prev) => prev || bizTables[0].table_number || bizTables[0].name);
        }
      } else if (preselectedTable) {
        setCustomTableNumber((prev) => prev || preselectedTable);
        setSelectedTableNumber((prev) => prev || preselectedTable);
      }
    } catch (e) {
      console.warn('Optional dining tables could not be loaded for checkout:', e);
      setTables([]);
      if (preselectedTable) {
        setCustomTableNumber((prev) => prev || preselectedTable);
        setSelectedTableNumber((prev) => prev || preselectedTable);
      }
    }
  };

  const taxAmount = Math.round((subtotal * 5) / 100);
  const grandTotal = Math.max(0, subtotal + taxAmount - appliedDiscount);

  // Authoritatively construct business-specific UPI payment URI
  const formatUpiVpa = (vpa) => {
    if (!vpa) return '';
    const trimmed = vpa.trim();
    const parts = trimmed.split('@');
    if (parts.length === 2) {
      return `${encodeURIComponent(parts[0])}@${encodeURIComponent(parts[1])}`;
    }
    return encodeURIComponent(trimmed);
  };

  const effectiveBusinessId = businessId || business?.id || items[0]?.business_id || businessSlug;
  const previewOrderRef = effectiveBusinessId ? `ORD-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}` : 'ORD';
  const orderRef = activeOrderRef || previewOrderRef;

  const storeUpiUri = upiConfig?.upi_id
    ? `upi://pay?pa=${formatUpiVpa(upiConfig.upi_id)}&pn=${encodeURIComponent(upiConfig.upi_name || business?.name || 'Store')}&am=${grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(upiConfig.upi_notes || `Order at ${business?.name || 'Store'}`)}&tr=${encodeURIComponent(orderRef)}`
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
    if (authLoading) {
      addToast('Verifying session, please try again in a moment...', 'info');
      return;
    }
    const targetBizId = business?.id || businessId || items[0]?.business_id || businessSlug;
    if (!targetBizId) {
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
      if (tables.length > 0 && selectedTableId && selectedTableId !== '__CUSTOM__') {
        const found = tables.find((t) => t.id === selectedTableId);
        finalTableId = found?.id || selectedTableId;
        finalTableNumber = found?.table_number || found?.name || selectedTableNumber;
      } else {
        finalTableNumber = customTableNumber.trim() || selectedTableNumber || preselectedTable || 'Counter / Open Seating';
        finalTableId = null;
      }
    }

    placingRef.current = true;
    setPlacing(true);
    setPaymentError('');
    try {
      const order = await orderService.createOrder({
        business_id: targetBizId,
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
      setActiveOrderRef(orderRef);

      // Notify business of incoming in-store order
      try {
        notificationService.createNotification({
          recipient_id: order.business_id,
          business_id: order.business_id,
          type: NOTIFICATION_TYPES.PAYMENT_PENDING,
          title: `New ${paymentMethod} Order: ₹${grandTotal} (${orderType === 'DINE_IN' ? `Table ${finalTableNumber}` : 'Takeaway'})`,
          message: `${customerName.trim()} placed order ${orderRef} worth ₹${grandTotal}.`,
          entity_id: orderRef,
          action_url: '/business/orders',
        }).catch(() => {});
      } catch (_) {}

      if (paymentMethod === 'UPI') {
        try {
          // Initialize direct business-specific UPI payment intent on backend
          const upiPayment = await orderService.createUpiPayment(orderRef, targetBizId);
          const paymentIntentUri = upiPayment?.upi_uri || storeUpiUri;

          // On mobile devices, trigger direct UPI app launching
          if (paymentIntentUri && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            try {
              window.location.href = paymentIntentUri;
            } catch (_) {}
          }

          clearCart();
          addToast('Order placed! Complete UPI payment in your UPI app.', 'success');
          navigate(`/payment-status/${orderRef}`);
        } catch (upiErr) {
          console.warn('Direct UPI payment registration note:', upiErr);
          clearCart();
          addToast('Order placed! Redirecting to payment status...', 'info');
          navigate(`/payment-status/${orderRef}`);
        }
      } else {
        // Cash payment
        clearCart();
        addToast('Order placed! Please pay cash on counter.', 'success');
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
        {/* Customer Account Session Status */}
        {!user || (user?.role || '').toUpperCase() !== 'CUSTOMER' ? (
          <div
            id="checkout-auth-banner"
            style={{
              padding: '0.85rem 1rem',
              background: '#EFF6FF',
              border: '1.5px solid #BFDBFE',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.88rem', color: '#1E40AF', display: 'block' }}>
                Guest Checkout Active
              </strong>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#3B82F6' }}>
                You can place your order now, or sign in to your customer pass to earn rewards and track this order.
              </p>
            </div>
            <Link
              to="/login/customer?redirect=/checkout"
              className="btn btn-sm btn-primary"
              style={{ flexShrink: 0, fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
            >
              Sign In
            </Link>
          </div>
        ) : (
          <div
            id="checkout-signed-in-badge"
            style={{
              padding: '0.65rem 0.85rem',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.82rem',
              color: '#166534',
            }}
          >
            <Check size={16} color="#16A34A" />
            <span>Signed in as <strong>{user.name || user.phone}</strong> (Customer Pass)</span>
          </div>
        )}

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
                    const val = e.target.value;
                    setSelectedTableId(val);
                    if (val === '__CUSTOM__') {
                      setSelectedTableNumber(customTableNumber || preselectedTable || '');
                    } else {
                      const t = tables.find((item) => item.id === val);
                      if (t) setSelectedTableNumber(t.table_number || t.name);
                    }
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
                  {preselectedTable && !tables.some((t) => t.id === preselectedTable || String(t.table_number) === String(preselectedTable)) && (
                    <option value="__CUSTOM__">
                      Scanned Table: {preselectedTable}
                    </option>
                  )}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {items.map((i) => (
              <div
                key={i.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontSize: '0.875rem',
                  borderBottom: '1px solid #F1F5F9',
                  paddingBottom: '0.65rem',
                }}
              >
                {i.image ? (
                  <img
                    src={i.image}
                    alt={i.name}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '10px',
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '10px',
                      background: '#FEF3C7',
                      color: '#D97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ShoppingBag size={20} />
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ color: '#1A2B49', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.name}
                  </strong>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '0.75rem' }}>
                    ₹{i.price} each
                  </span>
                  <span style={{ color: '#059669', fontWeight: 700, fontSize: '0.82rem' }}>
                    ₹{i.price * i.quantity}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#F1F5F9',
                      borderRadius: '999px',
                      padding: '2px 4px',
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => updateQuantity(i.id, -1)}
                      style={{
                        padding: '3px 5px',
                        color: '#1A2B49',
                        cursor: 'pointer',
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      aria-label="Decrease quantity"
                    >
                      <Minus size={13} />
                    </button>
                    <span
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        minWidth: '18px',
                        textAlign: 'center',
                        color: '#1A2B49',
                      }}
                    >
                      {i.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(i.id, 1)}
                      style={{
                        padding: '3px 5px',
                        color: '#1A2B49',
                        cursor: 'pointer',
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      aria-label="Increase quantity"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(i.id)}
                    style={{
                      padding: '4px',
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    aria-label="Remove item"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link
              to="/cart"
              style={{
                fontSize: '0.8rem',
                color: '#2563EB',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              ← Edit Full Cart
            </Link>
            <Link
              to={businessSlug ? `/m/${businessSlug}` : businessId ? `/b/${businessId}/menu` : '/customer'}
              style={{
                fontSize: '0.8rem',
                color: '#64748B',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              + Add more items
            </Link>
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
            {/* Option 1: Pay via UPI */}
            {loadingUpi ? (
              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: '14px',
                  border: '1.5px solid #E2E8F0',
                  background: '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: '#E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94A3B8',
                  }}
                >
                  <QrCode size={24} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.95rem', color: '#1A2B49' }}>Loading Store UPI Details...</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748B' }}>Fetching authoritative store payment QR</p>
                </div>
              </div>
            ) : upiConfig?.upi_id ? (
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
                    <button
                      type="button"
                      onClick={handlePlaceOrder}
                      disabled={placing}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '10px',
                        background: '#059669',
                        border: 'none',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        marginBottom: '0.5rem',
                        cursor: placing ? 'not-allowed' : 'pointer',
                        opacity: placing ? 0.7 : 1,
                      }}
                    >
                      <Smartphone size={18} />
                      {placing ? 'Placing Order...' : 'Place Order & Pay via UPI App'}
                    </button>
                    <p style={{ fontSize: '0.72rem', color: '#64748B', textAlign: 'center', margin: '0 0 0.5rem' }}>
                      💡 If your UPI app does not open automatically, copy the Store UPI ID above or scan the QR code.
                    </p>

                    {/* Automatic Verification Badge */}
                    <div
                      style={{
                        padding: '0.65rem 0.85rem',
                        background: '#F0FDF4',
                        borderRadius: '10px',
                        border: '1px solid #BBF7D0',
                        fontSize: '0.78rem',
                        color: '#166534',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                      }}
                    >
                      <ShieldCheck size={18} color="#16A34A" style={{ flexShrink: 0 }} />
                      <div>
                        <strong>Instant Automatic UPI Verification</strong>
                        <div style={{ fontSize: '0.72rem', color: '#15803D' }}>
                          Supports Google Pay, PhonePe, Paytm, BHIM, and all UPI apps. Cryptographically verified in real-time.
                        </div>
                      </div>
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
                  border: '1.5px dashed #CBD5E1',
                  background: '#F8FAFC',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  fontSize: '0.85rem',
                }}
              >
                <AlertCircle size={20} style={{ color: '#D97706', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.9rem', color: '#1A2B49' }}>
                    Pay via UPI (Not Configured by Store)
                  </strong>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                    This merchant has not set up direct UPI transfers yet. Please select "Cash on Counter" below.
                  </p>
                </div>
              </div>
            )}

            {/* Option 2: Cash on Counter */}
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
                  Cash on Counter
                </strong>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0' }}>
                  Pay cash directly at the counter upon pickup or dine-in
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

        {/* Clear Payment States Display */}
        {paymentState === 'AWAITING_PAYMENT' && (
          <div
            id="checkout-state-awaiting"
            style={{
              padding: '0.85rem 1rem',
              background: '#EFF6FF',
              border: '1.5px solid #93C5FD',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#1E40AF',
              fontSize: '0.85rem',
            }}
          >
            <Clock size={22} color="#2563EB" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '0.9rem' }}>Awaiting payment</strong>
              <span style={{ fontSize: '0.75rem', color: '#3B82F6' }}>
                Please complete payment in your UPI app (GPay, PhonePe, Paytm) or scan the QR code.
              </span>
            </div>
          </div>
        )}

        {paymentState === 'VERIFYING_PAYMENT' && (
          <div
            id="checkout-state-verifying"
            style={{
              padding: '0.85rem 1rem',
              background: '#F0FDF4',
              border: '1.5px solid #86EFAC',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#166534',
              fontSize: '0.85rem',
            }}
          >
            <RefreshCw size={22} color="#16A34A" className="animate-spin" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '0.9rem' }}>Verifying payment</strong>
              <span style={{ fontSize: '0.75rem', color: '#15803D' }}>
                Verifying authentic cryptographic signature with banking gateway...
              </span>
            </div>
          </div>
        )}

        {paymentState === 'PAYMENT_SUCCESSFUL' && (
          <div
            id="checkout-state-success"
            style={{
              padding: '0.85rem 1rem',
              background: '#DCFCE7',
              border: '2px solid #22C55E',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#15803D',
              fontSize: '0.85rem',
            }}
          >
            <CheckCircle2 size={24} color="#16A34A" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>Payment successful</strong>
              <span style={{ fontSize: '0.75rem', color: '#166534' }}>
                Payment verified and confirmed by server! Redirecting to receipt...
              </span>
            </div>
          </div>
        )}

        {paymentState === 'PAYMENT_FAILED' && (
          <div
            id="checkout-state-failed"
            style={{
              padding: '0.85rem 1rem',
              background: '#FEF2F2',
              border: '1.5px solid #FECACA',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              color: '#991B1B',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertCircle size={22} color="#DC2626" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>Payment failed</strong>
                <span style={{ fontSize: '0.75rem', color: '#B91C1C' }}>
                  {paymentError || 'Payment could not be verified by the server. Please retry.'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
              <Button size="sm" variant="danger" onClick={handlePlaceOrder}>
                Retry Order
              </Button>
              {activeOrderRef && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/payment-status/${activeOrderRef}`)}>
                  View Status
                </Button>
              )}
            </div>
          </div>
        )}

        {paymentState === 'PAYMENT_PENDING' && (
          <div
            id="checkout-state-pending"
            style={{
              padding: '0.85rem 1rem',
              background: '#FFFBEB',
              border: '1.5px solid #FDE68A',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              color: '#92400E',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Clock size={22} color="#D97706" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <strong style={{ display: 'block', fontSize: '0.9rem' }}>Payment pending</strong>
                <span style={{ fontSize: '0.75rem', color: '#B45309' }}>
                  Your order has been created and payment is pending. Please complete UPI payment or view order status.
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
              {activeOrderRef && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/payment-status/${activeOrderRef}`)}>
                  View Order Status
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Place Order Button */}
        <Button
          variant="primary"
          size="lg"
          block
          loading={placing || paymentState === 'VERIFYING_PAYMENT'}
          disabled={
            placing ||
            paymentState === 'VERIFYING_PAYMENT' ||
            paymentState === 'PAYMENT_SUCCESSFUL' ||
            (paymentMethod === 'UPI' && !upiConfig?.upi_id)
          }
          onClick={handlePlaceOrder}
          icon={paymentState === 'PAYMENT_SUCCESSFUL' ? CheckCircle2 : Check}
          style={{
            padding: '1rem',
            fontSize: '1.05rem',
            fontWeight: 800,
            background:
              paymentState === 'PAYMENT_SUCCESSFUL'
                ? '#16A34A'
                : paymentMethod === 'UPI'
                ? '#059669'
                : '#F59E0B',
            borderColor:
              paymentState === 'PAYMENT_SUCCESSFUL'
                ? '#16A34A'
                : paymentMethod === 'UPI'
                ? '#059669'
                : '#F59E0B',
          }}
        >
          {paymentState === 'AWAITING_PAYMENT'
            ? 'Awaiting UPI Payment...'
            : paymentState === 'VERIFYING_PAYMENT'
            ? 'Verifying Payment...'
            : paymentState === 'PAYMENT_SUCCESSFUL'
            ? 'Payment Confirmed!'
            : paymentState === 'PAYMENT_FAILED'
            ? `Retry UPI Order — ₹${grandTotal}`
            : paymentState === 'PAYMENT_PENDING'
            ? `Complete Order — ₹${grandTotal}`
            : paymentMethod === 'UPI'
            ? `Place Order & Pay via UPI — ₹${grandTotal}`
            : `Place Order (Cash on Counter) — ₹${grandTotal}`}
        </Button>
      </div>
    </div>
  );
};

export default PublicCheckout;
