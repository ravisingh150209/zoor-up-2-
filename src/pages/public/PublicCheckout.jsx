import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  ArrowLeft,
  CreditCard,
  Banknote,
  Tag,
  CheckCircle2,
  Clock,
  Store,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Utensils,
  Package
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
  const { items, subtotal, clearCart, businessSlug } = useCart();
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [business, setBusiness] = useState(null);
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('UPI'); // 'UPI' | 'CASH'
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);

  // Dining option & Table selection state
  const [orderType, setOrderType] = useState('DINE_IN'); // 'DINE_IN' | 'TAKEAWAY'
  const [tables, setTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [selectedTableNumber, setSelectedTableNumber] = useState('');
  const [customTableNumber, setCustomTableNumber] = useState('');

  useEffect(() => {
    loadBusiness();
  }, [businessSlug]);

  const loadBusiness = async () => {
    try {
      let b = null;
      if (businessSlug) {
        b = await businessService.getBusinessBySlug(businessSlug);
        if (!b) {
          b = await businessService.getBusiness(businessSlug);
        }
      } else {
        const allBiz = await businessService.getAllBusinesses();
        if (allBiz.length > 0) b = allBiz[0];
      }
      if (b) {
        setBusiness(b);
        loadBusinessTables(b.id);
      }
    } catch (e) {
      console.error(e);
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
    if (appliedDiscount > 0) {
      addToast('This coupon cannot be verified for server-priced checkout. Remove it and retry.', 'error');
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
      });

      const invoice = await billingService.createInvoice({
        order_id: order.order_id || order.id,
        business_id: order.business_id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        items: order.items,
        subtotal: order.subtotal,
        tax_amount: order.tax,
        discount_amount: order.discount,
        total_amount: order.total,
        payment_mode: paymentMethod,
        payment_status: order.payment_status,
        order_type: order.order_type,
        table_id: order.table_id,
        table_number: order.table_number,
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
          action_url: '/business/payments',
        }).catch(() => {});
      } catch (_) {}

      clearCart();
      addToast('Order recorded! Proceeding to payment confirmation...', 'info');
      navigate(`/payment-status/${invoice.id}`);
    } catch (e) {
      console.error(e);
      addToast(e.message || 'Error placing order', 'error');
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
            {/* UPI Option */}
            <div
              onClick={() => setPaymentMethod('UPI')}
              style={{
                padding: '1rem',
                borderRadius: '12px',
                border: paymentMethod === 'UPI' ? '2px solid #F59E0B' : '1px solid #E2E8F0',
                background: paymentMethod === 'UPI' ? '#FEF3C7' : '#FAFAFB',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={20} color={paymentMethod === 'UPI' ? '#D97706' : '#64748B'} />
                <strong style={{ fontSize: '0.95rem', color: '#1A2B49' }}>UPI / QR</strong>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
                Instant dynamic UPI QR & app payment
              </p>
            </div>

            {/* Cash Option */}
            <div
              onClick={() => setPaymentMethod('CASH')}
              style={{
                padding: '1rem',
                borderRadius: '12px',
                border: paymentMethod === 'CASH' ? '2px solid #F59E0B' : '1px solid #E2E8F0',
                background: paymentMethod === 'CASH' ? '#FEF3C7' : '#FAFAFB',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Banknote size={20} color={paymentMethod === 'CASH' ? '#D97706' : '#64748B'} />
                <strong style={{ fontSize: '0.95rem', color: '#1A2B49' }}>Pay Cash</strong>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
                Pay cash directly at store counter
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#F8FAFC',
              borderRadius: '8px',
              fontSize: '0.78rem',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <ShieldCheck size={16} color="#16A34A" style={{ flexShrink: 0 }} />
            <span>
              Transactions are verified directly at the business counter before loyalty points are awarded.
            </span>
          </div>
        </div>

        {/* Place Order & Pay Button */}
        <Button
          variant="primary"
          size="lg"
          block
          loading={placing}
          disabled={placing}
          onClick={handlePlaceOrder}
          icon={CheckCircle2}
          style={{ padding: '0.95rem', fontSize: '1.05rem', fontWeight: 800 }}
        >
          Pay ₹{grandTotal} via {paymentMethod}
        </Button>
      </div>
    </div>
  );
};

export default PublicCheckout;
