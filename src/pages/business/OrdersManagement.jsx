import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  Eye,
  User,
  MapPin,
  IndianRupee,
  Phone,
  Printer
} from 'lucide-react';
import { orderService, ORDER_STATUSES } from '../../services/orderService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { Tabs, SearchBar } from '../../components/ui/Controls';
import { LoadingState, EmptyState, ErrorState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const OrdersManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loadError, setLoadError] = useState('');
  const requestGeneration = useRef(0);

  const bizId = user?.business_id;

  useEffect(() => {
    setOrders([]);
    setSelectedOrder(null);
    setLoadError('');
    loadOrders();
    return () => { requestGeneration.current += 1; };
  }, [bizId, statusFilter, search]);

  const loadOrders = async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError('');
    try {
      const data = await orderService.getOrders(bizId, {
        status: statusFilter,
        search,
      });
      if (generation === requestGeneration.current) setOrders(data);
    } catch (e) {
      console.error(e);
      if (generation === requestGeneration.current) setLoadError(e.message || 'Unable to load business orders.');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      const updated = await orderService.updateOrderStatus(orderId, newStatus);
      addToast(`Order ${orderId} moved to ${ORDER_STATUSES[newStatus]?.label || newStatus}!`, 'success');
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updated);
      }
      loadOrders();
    } catch (e) {
      addToast(e.message || 'Error updating order status', 'error');
    }
  };

  const columns = [
    {
      header: 'Order ID',
      accessor: 'id',
      render: (id, row) => (
        <div>
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-400)' }}>{id}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: 'Customer',
      accessor: 'customer_name',
      render: (name, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{row.customer_phone}</div>
        </div>
      ),
    },
    {
      header: 'Type & Items',
      accessor: 'order_type',
      render: (type, row) => (
        <div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{type}</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {row.items?.length || 0} item(s)
          </div>
        </div>
      ),
    },
    {
      header: 'Total',
      accessor: 'total',
      render: (total, row) => (
        <div>
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>₹{total}</strong>
          <div style={{ fontSize: '0.725rem', color: row.payment_status === 'PAID' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
            ● {row.payment_status} ({row.payment_method})
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (status) => {
        const info = ORDER_STATUSES[status] || { label: status, color: 'neutral' };
        return <Badge variant={info.color}>{info.label}</Badge>;
      },
    },
    {
      header: 'Quick Action',
      accessor: 'id',
      align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
          {row.status === 'NEW' && (
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateStatus(row.id, 'CONFIRMED');
              }}
            >
              Confirm
            </Button>
          )}
          {row.status === 'CONFIRMED' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateStatus(row.id, 'PREPARING');
              }}
            >
              Prepare
            </Button>
          )}
          {row.status === 'PREPARING' && (
            <Button
              variant="success"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateStatus(row.id, 'READY');
              }}
            >
              Ready
            </Button>
          )}
          {row.status === 'READY' && (
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateStatus(row.id, 'COMPLETED');
              }}
            >
              Complete
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedOrder(row);
            }}
          >
            <Eye size={16} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Orders Fulfillment Center</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            In-store purchase orders tracking, counter preparation and completions.
          </p>
        </div>
      </div>

      <Tabs
        activeTab={statusFilter}
        onChange={setStatusFilter}
        tabs={[
          { id: 'ALL', label: 'All Orders' },
          { id: 'NEW', label: 'New Orders' },
          { id: 'PREPARING', label: 'Preparing' },
          { id: 'READY', label: 'Ready for Dispatch' },
          { id: 'COMPLETED', label: 'Completed' },
          { id: 'CANCELLED', label: 'Cancelled' },
        ]}
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search Order ID (#ORD-...), customer name, or phone..."
      />

      {loading ? (
        <LoadingState message="Loading live orders..." />
      ) : loadError ? (
        <ErrorState title="Unable to load orders" message={loadError} onRetry={loadOrders} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No orders found"
          description="There are no active orders matching this filter."
        />
      ) : (
        <Table
          columns={columns}
          data={orders}
          onRowClick={(row) => setSelectedOrder(row)}
        />
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <Modal
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          title={`Order Details: ${selectedOrder.id}`}
          maxWidth="640px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
                Print Ticket
              </Button>
              <Button variant="ghost" onClick={() => setSelectedOrder(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Top Status & Customer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                background: 'var(--bg-surface-elevated)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Customer:</span>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedOrder.customer_name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {selectedOrder.customer_phone}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status:</span>
                <div>
                  <Badge variant={ORDER_STATUSES[selectedOrder.status]?.color || 'neutral'}>
                    {ORDER_STATUSES[selectedOrder.status]?.label || selectedOrder.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Address */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.85rem' }}>
              <MapPin size={18} className="text-primary-400 mt-1 flex-shrink-0" />
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Fulfillment Mode: {selectedOrder.order_type}</strong>
                <p style={{ color: 'var(--text-secondary)' }}>{selectedOrder.delivery_address}</p>
              </div>
            </div>

            {/* Items List */}
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                Order Items:
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {selectedOrder.items?.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.65rem 0.85rem',
                      background: 'var(--bg-input)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.875rem',
                    }}
                  >
                    <div>
                      <strong>{item.name}</strong> × {item.quantity}
                    </div>
                    <div style={{ fontWeight: 700 }}>₹{item.price * item.quantity}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div
              style={{
                padding: '1rem',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span>₹{selectedOrder.subtotal}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-emerald)' }}>
                  <span>Discount Applied:</span>
                  <span>-₹{selectedOrder.discount}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
                <span>Total:</span>
                <span>₹{selectedOrder.total}</span>
              </div>
            </div>

            {/* Lifecycle Transition Buttons */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block' }}>
                Advance Order Pipeline:
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {( {
                  NEW: ['CONFIRMED', 'CANCELLED'],
                  CONFIRMED: ['PREPARING', 'CANCELLED'],
                  PREPARING: ['READY', 'CANCELLED'],
                  READY: ['COMPLETED', 'CANCELLED'],
                }[selectedOrder.status] || []).map((st) => (
                  <Button
                    key={st}
                    variant={selectedOrder.status === st ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => handleUpdateStatus(selectedOrder.id, st)}
                  >
                    {ORDER_STATUSES[st]?.label || st}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
