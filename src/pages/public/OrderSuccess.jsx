import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Store,
  Receipt
} from 'lucide-react';
import { orderService } from '../../services/orderService';
import { businessService } from '../../services/businessService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';

export const OrderSuccess = () => {
  const { orderId } = useParams();
  const { addToast } = useToast();

  const [order, setOrder] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOrderData();
  }, [orderId]);

  const loadOrderData = async () => {
    setLoading(true);
    setError('');
    try {
      if (!orderId) {
        setError('No order reference was provided.');
        return;
      }

      const ord = await orderService.getOrderById(orderId);
      if (!ord || !(ord.id || ord.order_id)) {
        setError('Order not found.');
        return;
      }

      setOrder(ord);
      if (ord.business_id) {
        const b = await businessService.getBusiness(ord.business_id);
        setBusiness(b);
      }
    } catch (err) {
      setError(err.message || 'Order could not be loaded from the server.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '1.25rem' }}>Loading order...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ color: '#DC2626', fontWeight: 600 }}>{error}</div>
          <Link to="/customer" className="btn btn-primary" style={{ marginTop: '1rem' }}>Go to Dashboard</Link>
        </div>
      </div>
    );
  }

  const grandTotal = order.total || order.total_amount || 0;

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="card" style={{ maxWidth: '520px', width: '100%', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '20px', padding: '2rem 1.75rem', boxShadow: '0 8px 30px rgba(26, 43, 73, 0.06)', textAlign: 'center' }}>
        {/* Status Icon */}
        <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <CheckCircle2 size={38} />
        </div>

        {/* Title */}
        <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', margin: '0 0 0.35rem' }}>
          Order Placed Successfully!
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '0 0 1.5rem' }}>
          Your order has been recorded. Pay cash at the store counter when you pick up or dine.
        </p>

        {/* Transaction Card */}
        <div style={{ background: '#FAFAFB', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Store / Merchant:</span>
            <strong style={{ color: '#1A2B49' }}>{business?.name || 'Local Partner Store'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Order / Ref:</span>
            <strong style={{ fontFamily: 'monospace', color: '#1A2B49' }}>{order.id}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Amount Payable:</span>
            <strong style={{ fontSize: '1.15rem', color: '#1A2B49' }}>₹{grandTotal}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Service:</span>
            <strong style={{ color: '#1A2B49' }}>
              {order.order_type === 'DINE_IN'
                ? `Dine-in (Table ${order.table_number || 'Reserved'})`
                : order.order_type === 'TAKEAWAY'
                ? 'Takeaway / Pickup'
                : 'In-Store'}
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Payment Method:</span>
            <Badge variant="secondary">CASH</Badge>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748B' }}>Verification Status:</span>
            <Badge variant="warning">AWAITING VERIFICATION</Badge>
          </div>

          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem', color: '#D97706', fontSize: '0.78rem' }}>
            💡 +{Math.floor(grandTotal / 10)} Loyalty Points will be credited once verified at counter.
          </div>
        </div>

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

export default OrderSuccess;