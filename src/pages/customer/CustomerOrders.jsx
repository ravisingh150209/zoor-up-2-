import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  ChevronRight,
  Eye,
  Receipt,
  CreditCard,
  Banknote,
  RefreshCw
} from 'lucide-react';
import { orderService, ORDER_STATUSES } from '../../services/orderService';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { LoadingState, EmptyState, ErrorState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';

export const CustomerOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const requestGeneration = useRef(0);

  useEffect(() => {
    setOrders([]);
    setSelectedOrder(null);
    setLoadError('');
    loadOrders();
    return () => { requestGeneration.current += 1; };
  }, [user?.id]);

  const loadOrders = async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError('');
    try {
      const data = await orderService.getCustomerOrders();
      if (generation === requestGeneration.current) setOrders(data);
    } catch (e) {
      console.error(e);
      if (generation === requestGeneration.current) setLoadError(e.message || 'Unable to load orders.');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  const getTimelineSteps = (currentStatus) => {
    const steps = [
      { key: 'NEW', label: 'Order Received' },
      { key: 'CONFIRMED', label: 'Confirmed' },
      { key: 'PREPARING', label: 'Preparing' },
      { key: 'READY', label: 'Ready for Pickup' },
      { key: 'COMPLETED', label: 'Completed' },
    ];

    const orderSequence = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];
    const currentIdx = orderSequence.indexOf(currentStatus);

    return steps.map((s) => {
      const stepIdx = orderSequence.indexOf(s.key);
      const isDone = currentIdx >= stepIdx;
      const isCurrent = currentStatus === s.key;
      return { ...s, isDone, isCurrent };
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49' }}>My Purchases & In-Store Receipts</h2>
          <p style={{ color: '#64748B', fontSize: '0.85rem' }}>
            View your verified store purchase history, receipts, and loyalty points earned.
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={loadOrders} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <LoadingState message="Loading orders..." />
      ) : loadError ? (
        <ErrorState title="Unable to load orders" message={loadError} onRetry={loadOrders} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No orders yet."
          description="Scan a store QR menu and make your first in-store purchase."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {orders.map((order) => {
            const statusInfo = ORDER_STATUSES[order.status] || { label: order.status, color: 'neutral' };
            const timeline = getTimelineSteps(order.status);

            return (
              <Card
                key={order.id}
                className="card-hover cursor-pointer"
                onClick={() => setSelectedOrder(order)}
                style={{ padding: '1.25rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--primary-400)' }}>
                        {order.id}
                      </strong>
                      <Badge variant={statusInfo.color}>{statusInfo.label}</Badge>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      Recorded on {new Date(order.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#1A2B49' }}>
                      ₹{order.total}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 600 }}>
                      + {Math.floor((order.total / 100) * 10)} pts eligible
                    </span>
                  </div>
                </div>

                {/* Progress Tracker */}
                <div style={{ margin: '1rem 0 0.75rem', padding: '0.75rem', background: '#FAFAFB', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                    {timeline.map((step, idx) => (
                      <div
                        key={step.key}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          flex: 1,
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: step.isDone ? '#16A34A' : '#E2E8F0',
                            color: step.isDone ? '#fff' : '#64748B',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `2px solid ${step.isDone ? '#16A34A' : '#CBD5E1'}`,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            zIndex: 2,
                          }}
                        >
                          {step.isDone ? '✓' : idx + 1}
                        </div>
                        <span style={{ fontSize: '0.65rem', color: step.isDone ? '#1A2B49' : '#94A3B8', marginTop: '4px', maxWidth: '70px', lineHeight: 1.2 }}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#64748B' }}>
                  <span>{order.items?.length || 0} item(s) • Paid via {order.payment_method || 'UPI'}</span>
                  <span style={{ color: '#D97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                    View Receipt <ChevronRight size={14} />
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Selected Order Modal */}
      {selectedOrder && (
        <Modal
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          title={`Purchase Receipt ${selectedOrder.id}`}
          footer={
            <Button variant="secondary" onClick={() => setSelectedOrder(null)}>
              Close
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
            <div style={{ padding: '0.75rem', background: '#FAFAFB', borderRadius: '10px' }}>
              <strong>Payment Method:</strong> {selectedOrder.payment_method || 'UPI'}
              <p style={{ color: '#64748B', margin: '2px 0 0' }}>
                Status: <strong>{selectedOrder.payment_status}</strong>
              </p>
            </div>

            <div>
              <strong style={{ color: '#1A2B49', marginBottom: '0.5rem', display: 'block' }}>
                Items Purchased:
              </strong>
              {selectedOrder.items?.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid #F1F5F9' }}>
                  <span>{it.name} × {it.quantity}</span>
                  <strong>₹{it.price * it.quantity}</strong>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span>₹{selectedOrder.subtotal}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.05rem', borderTop: '1px solid #E2E8F0', paddingTop: '6px' }}>
                <span>Total Amount:</span>
                <span style={{ color: '#1A2B49' }}>₹{selectedOrder.total}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CustomerOrders;
