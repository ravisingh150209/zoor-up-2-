import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
  Check
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

// Payment method badge component
const PaymentBadge = ({ icon, label, selected }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.3rem 0.6rem',
    fontSize: '0.65rem',
    fontWeight: 600,
    borderRadius: '999px',
    color: selected ? '#00B89C' : '#94A3B8',
    background: selected ? '#ECFDF5' : '#F8FAFC',
    border: selected ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
    transition: 'all 0.15s ease',
  }}>
    <span style={{ color: selected ? '#00B89C' : '#94A3B8' }}>{icon}</span>
    {label}
  </span>
);

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

export const PublicCheckout = () => {
  const { items, subtotal, clearCart, businessSlug, businessId } = useCart();
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [business, setBusiness] = useState(null);
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('RAZORPAY'); // 'RAZORPAY' | 'CASH'
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  const [razorpayLoading, setRazorpayLoading] = useState(false);

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

    let finalTableNumber = null;
    let finalTableId = null;

    if (orderType === 'DINE_IN') {
      if (tables.length > 0) {
        if (!selectedTableId) {
          addToast('Please select your dining table', 'error');
          return;
        }
        const found = tables.find(t => t.id === selectedTableId);
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

      // Notify business of new in-store purchase
      try {
        notificationService.createNotification({
          recipient_id: order.business_id,
          business_id: order.business_id,
          type: NOTIFICATION_TYPES.PAYMENT_PENDING,
          title: `New ${paymentMethod} Order: ₹${grandTotal} (${orderType === 'DINE_IN' ? `Table ${finalTableNumber}` : 'Takeaway'})`,
          message: `${customerName.trim()} ordered items worth ₹${grandTotal} (${orderType === 'DINE_IN' ? `Table ${finalTableNumber}` : 'Takeaway'}). Verification required.`,
          entity_id: order.order_id || order.id,
          action_url: '/business/orders',
        }).catch(() => {});
      } catch (_) {}

      clearCart();
      const orderRef = order.order_id || order.id || order.invoice_id;

      if (paymentMethod === 'RAZORPAY') {
        // Handle Razorpay checkout
        try {
          setRazorpayLoading(true);
          const rzpOrder = await orderService.createRazorpayOrder(orderRef, business.id);
          
          if (!rzpOrder?.razorpay_order_id || !rzpOrder?.razorpay_key_id) {
            throw new Error('Invalid Razorpay order response');
          }
          
          // Load Razorpay script and open checkout
          await loadRazorpayScript();
          
          const options = {
            key: rzpOrder.razorpay_key_id,
            amount: rzpOrder.amount_paise,
            currency: rzpOrder.currency,
            name: business?.name || 'ZOOR UP Store',
            description: `Order ${orderRef}`,
            order_id: rzpOrder.razorpay_order_id,
            handler: async (response) => {
              // Payment successful on frontend, now verify with backend
              try {
                setRazorpayLoading(true);
                const verifyResult = await orderService.verifyRazorpayPayment({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  order_id: orderRef,
                });
                
                addToast('Payment verified successfully!', 'success');
                navigate(`/order-success/${orderRef}`);
              } catch (verifyErr) {
                console.error('Razorpay verification failed:', verifyErr);
                const errMsg = getErrorMessage(verifyErr);
                addToast(errMsg || 'Payment verification failed', 'error');
                // Still navigate to order success but show pending status
                navigate(`/payment-status/${rzpOrder.payment_id}`);
              } finally {
                setRazorpayLoading(false);
              }
            },
            prefill: {
              name: customerName.trim(),
              contact: customerPhone.trim(),
              email: user?.email || '',
            },
            notes: {
              order_id: orderRef,
              business_id: business.id,
            },
            theme: {
              color: '#00B89C',
            },
            modal: {
              ondismiss: () => {
                // User cancelled the payment
                addToast('Payment cancelled. Your order is still pending.', 'warning');
                navigate(`/payment-status/${rzpOrder.payment_id}`);
              },
            },
          };
          
          const rzp = new window.Razorpay(options);
          rzp.on('payment.failed', async (response) => {
            console.error('Razorpay payment failed:', response.error);
            const message = getErrorMessage(response?.error || response, 'Payment failed. Please try again.');
            addToast(message, 'error');
            setRazorpayLoading(false);
            navigate(`/payment-status/${rzpOrder.payment_id}`);
          });
          rzp.open();
          
        } catch (rzpErr) {
          console.error('Razorpay checkout error:', rzpErr);
          const errMsg = getErrorMessage(rzpErr);
          addToast(errMsg || 'Failed to initiate Razorpay payment', 'error');
          setRazorpayLoading(false);
          navigate(`/order-success/${orderRef}`);
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
    <div
      style={{
        minHeight: '100vh',
        background: '#FAFAFB',
        padding: '1.25rem 1rem 80px',
        maxWidth: '560px',
        margin: '0 auto',
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <Link to={businessSlug ? `/m/${businessSlug}` : '/customer'} className="btn-ghost" style={{ padding: '6px' }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>Review & Pay</h2>
          {business?.name && (
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0' }}>
              🏬 {business.name}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Customer Information */}
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
              label="Mobile Number (for SMS & Loyalty)"
              placeholder="e.g. 9876543210"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Dining & Service Option */}
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
            Service Preference
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            {/* Dine-in Option */}
            <div
              onClick={() => setOrderType('DINE_IN')}
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                border: orderType === 'DINE_IN' ? '2px solid #F59E0B' : '1px solid #E2E8F0',
                background: orderType === 'DINE_IN' ? '#FEF3C7' : '#FAFAFB',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
              }}
            >
              <Utensils size={20} color={orderType === 'DINE_IN' ? '#D97706' : '#64748B'} />
              <div>
                <strong style={{ fontSize: '0.9rem', color: '#1A2B49', display: 'block' }}>Dine-in</strong>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Table Service</span>
              </div>
            </div>

            {/* Takeaway Option */}
            <div
              onClick={() => setOrderType('TAKEAWAY')}
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                border: orderType === 'TAKEAWAY' ? '2px solid #F59E0B' : '1px solid #E2E8F0',
                background: orderType === 'TAKEAWAY' ? '#FEF3C7' : '#FAFAFB',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
              }}
            >
              <Package size={20} color={orderType === 'TAKEAWAY' ? '#D97706' : '#64748B'} />
              <div>
                <strong style={{ fontSize: '0.9rem', color: '#1A2B49', display: 'block' }}>Takeaway</strong>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Counter Pickup</span>
              </div>
            </div>
          </div>

          {/* If Dine-in: Ask for Table Number */}
          {orderType === 'DINE_IN' && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1A2B49', marginBottom: '0.35rem' }}>
                Select Table Number <span style={{ color: '#DC2626' }}>*</span>
              </label>
              {tables.length > 0 ? (
                <select
                  value={selectedTableId}
                  onChange={(e) => {
                    setSelectedTableId(e.target.value);
                    const t = tables.find(x => x.id === e.target.value);
                    setSelectedTableNumber(t?.table_number || '');
                  }}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '0.875rem',
                    color: '#1A2B49',
                  }}
                  required
                >
                  <option value="">-- Choose your table --</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.table_number} (Capacity: {t.capacity} • {t.location || 'Dining Floor'})
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
              <span style={{ color: '#F59E0B' }}>₹{grandTotal}</span>
            </div>
          </div>
        </div>

        {/* Payment Method Selection */}
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
            Choose Payment Method
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Razorpay Option (Primary) - Full width premium card */}
            <div
              onClick={() => setPaymentMethod('RAZORPAY')}
              style={{
                padding: '1.25rem',
                borderRadius: '14px',
                border: paymentMethod === 'RAZORPAY' ? '2.5px solid #00B89C' : '1.5px solid #E2E8F0',
                background: paymentMethod === 'RAZORPAY' 
                  ? 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)' 
                  : '#FAFAFB',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: paymentMethod === 'RAZORPAY' 
                  ? '0 4px 14px rgba(0, 184, 156, 0.12)' 
                  : '0 1px 3px rgba(0, 0, 0, 0.04)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Selected indicator */}
              {paymentMethod === 'RAZORPAY' && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  background: 'linear-gradient(90deg, #00B89C, #00D4A3)',
                }} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {/* Razorpay Logo/Icon Area */}
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '14px',
                  background: paymentMethod === 'RAZORPAY' 
                    ? 'linear-gradient(135deg, #00B89C, #00D4A3)' 
                    : '#F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: paymentMethod === 'RAZORPAY' 
                    ? '0 4px 12px rgba(0, 184, 156, 0.3)' 
                    : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <Smartphone size={22} color={paymentMethod === 'RAZORPAY' ? '#FFFFFF' : '#64748B'} />
                    <Lock size={16} color={paymentMethod === 'RAZORPAY' ? '#FFFFFF' : '#64748B'} />
                  </div>
                </div>

                {/* Payment Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <strong style={{ 
                      fontSize: '1.05rem', 
                      color: '#1A2B49',
                      fontWeight: 700,
                    }}>
                      Pay Securely with Razorpay
                    </strong>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: '#00B89C',
                      background: paymentMethod === 'RAZORPAY' ? '#D1FAE5' : '#F1F5F9',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '999px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      Test Mode
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      color: '#16A34A',
                      background: '#DCFCE7',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '999px',
                    }}>
                      <ShieldCheck size={10} style={{ marginRight: '2px', display: 'inline-block', verticalAlign: 'middle' }} />
                      Secure
                    </span>
                  </div>
                  <p style={{ 
                    fontSize: '0.8rem', 
                    color: '#64748B', 
                    margin: '0.25rem 0 0',
                    lineHeight: 1.4,
                  }}>
                    Cards, UPI, Netbanking, Wallets & EMI
                  </p>
                </div>

                {/* Selection indicator */}
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  border: paymentMethod === 'RAZORPAY' ? '2.5px solid #00B89C' : '2px solid #CBD5E1',
                  background: paymentMethod === 'RAZORPAY' ? '#00B89C' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}>
                  {paymentMethod === 'RAZORPAY' && (
                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                  )}
                </div>
              </div>

              {/* Supported methods row */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.6rem',
                paddingTop: '0.25rem',
                borderTop: paymentMethod === 'RAZORPAY' ? '1px solid rgba(0, 184, 156, 0.15)' : '1px solid #F1F5F9',
                marginTop: '0.25rem',
              }}>
                <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Accepted:
                </span>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <PaymentBadge icon={<CreditCard size={12} />} label="Visa" selected={paymentMethod === 'RAZORPAY'} />
                  <PaymentBadge icon={<CreditCard size={12} />} label="Mastercard" selected={paymentMethod === 'RAZORPAY'} />
                  <PaymentBadge icon={<Smartphone size={12} />} label="UPI" selected={paymentMethod === 'RAZORPAY'} />
                  <PaymentBadge icon={<Globe size={12} />} label="Netbanking" selected={paymentMethod === 'RAZORPAY'} />
                  <PaymentBadge icon={<Lock size={12} />} label="Wallets" selected={paymentMethod === 'RAZORPAY'} />
                </div>
              </div>
            </div>

            {/* Cash Option - Secondary */}
            <div
              onClick={() => setPaymentMethod('CASH')}
              style={{
                padding: '1.1rem',
                borderRadius: '14px',
                border: paymentMethod === 'CASH' ? '2.5px solid #F59E0B' : '1.5px solid #E2E8F0',
                background: paymentMethod === 'CASH' 
                  ? 'linear-gradient(135deg, #FEF3C7 0%, #FFFAEB 100%)' 
                  : '#FAFAFB',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                boxShadow: paymentMethod === 'CASH' 
                  ? '0 4px 14px rgba(245, 158, 11, 0.12)' 
                  : '0 1px 3px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '12px',
                background: paymentMethod === 'CASH' ? '#F59E0B' : '#F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: paymentMethod === 'CASH' ? '0 3px 10px rgba(245, 158, 11, 0.3)' : 'none',
              }}>
                <Banknote size={22} color={paymentMethod === 'CASH' ? '#FFFFFF' : '#64748B'} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: '1rem', color: '#1A2B49', fontWeight: 700, display: 'block' }}>
                  Pay Cash at Counter
                </strong>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0.15rem 0 0', lineHeight: 1.4 }}>
                  Pay directly when you pick up or dine
                </p>
              </div>

              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: paymentMethod === 'CASH' ? '2.5px solid #F59E0B' : '2px solid #CBD5E1',
                background: paymentMethod === 'CASH' ? '#F59E0B' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}>
                {paymentMethod === 'CASH' && (
                  <Check size={14} color="#FFFFFF" strokeWidth={3} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Place Order & Pay Button */}
        <Button
          variant="primary"
          size="lg"
          block
          loading={placing || razorpayLoading}
          disabled={placing || razorpayLoading}
          onClick={handlePlaceOrder}
          icon={CheckCircle2}
          style={{ padding: '0.95rem', fontSize: '1.05rem', fontWeight: 800 }}
        >
          {paymentMethod === 'RAZORPAY' ? `Pay Securely with Razorpay — ₹${grandTotal}` : `Place Cash Order — ₹${grandTotal}`}
        </Button>
      </div>
    </div>
  );
};

export default PublicCheckout;
