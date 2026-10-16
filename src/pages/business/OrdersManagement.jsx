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
    if (!bizId) {
      setLoading(false);
      return;
    }
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
      header: 'Order ID & Time',
      accessor: 'id',
      render: (id, row) => (
        <div>
          <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-400)', fontSize: '0.9rem' }}>
            #{id}
          </strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {new Date(row.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })},{' '}
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
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{name || 'Guest Customer'}</div>
          {row.customer_phone ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
              <Phone size={12} />
              <span>{row.customer_phone}</span>
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No phone</div>
          )}
        </div>
      ),
    },
    {
      header: 'Ordered Products',
      accessor: 'items',
      render: (items, row) => {
        const orderItems = Array.isArray(items) ? items : [];
        const totalItemsCount = orderItems.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);
        if (orderItems.length === 0) {
          return (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>{row.order_type || 'Order'} (0 items)</span>
            </div>
          );
        }
        return (
          <div style={{ minWidth: '220px', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {orderItems.map((item, idx) => {
              const pName = item.name || item.product_name || `Product #${item.product_id || item.id || idx + 1}`;
              const qty = Number(item.quantity) || 1;
              const price = Number(item.price ?? item.unit_price ?? 0);
              const lineTotal = Number(item.subtotal ?? item.line_total ?? (price * qty));
              return (
                <div
                  key={idx}
                  style={{
                    fontSize: '0.8rem',
                    lineHeight: '1.3',
                    paddingBottom: idx < orderItems.length - 1 ? '0.3rem' : 0,
                    borderBottom: idx < orderItems.length - 1 ? '1px dashed var(--border-subtle, #E2E8F0)' : 'none',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                    {idx + 1}. {pName}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                    Qty: <strong>{qty}</strong> × ₹{price.toLocaleString()} = <strong style={{ color: 'var(--text-primary)' }}>₹{lineTotal.toLocaleString()}</strong>
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Total Items: {totalItemsCount}</span>
              <span>•</span>
              <span>{row.order_type || 'Store'} {row.table_number ? `(Table ${row.table_number})` : ''}</span>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Total & Payment',
      accessor: 'total',
      render: (total, row) => (
        <div>
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
            ₹{Number(total || row.total_amount || 0).toLocaleString()}
          </strong>
          <div style={{ fontSize: '0.725rem', marginTop: '2px', color: row.payment_status === 'PAID' ? 'var(--accent-emerald, #059669)' : 'var(--accent-amber, #D97706)' }}>
            ● {row.payment_status || 'PENDING'} ({row.payment_method || 'CASH'})
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
        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', alignItems: 'center' }}>
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
            title="View Order Details"
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
          { id: 'CONFIRMED', label: 'Confirmed' },
          { id: 'PREPARING', label: 'Preparing' },
          { id: 'READY', label: 'Ready for Dispatch' },
          { id: 'COMPLETED', label: 'Completed' },
          { id: 'CANCELLED', label: 'Cancelled' },
        ]}
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search Order ID (#ORD-...), product name, customer name, or phone..."
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
          title={`Order #${selectedOrder.id}`}
          maxWidth="680px"
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
            {/* Top Customer & Status Card */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '1rem 1.25rem',
                background: 'var(--bg-surface-elevated, #F8FAFC)',
                borderRadius: 'var(--radius-lg, 12px)',
                border: '1px solid var(--border-subtle, #E2E8F0)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Customer Information
                </span>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)', marginTop: '2px' }}>
                  Customer: {selectedOrder.customer_name || 'Rahul'}
                </div>
                {selectedOrder.customer_phone && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                    <Phone size={13} />
                    <span>{selectedOrder.customer_phone}</span>
                  </div>
                )}
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Ordered on: {new Date(selectedOrder.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Order Status
                </span>
                <div style={{ marginTop: '4px' }}>
                  <Badge variant={ORDER_STATUSES[selectedOrder.status]?.color || 'neutral'}>
                    {ORDER_STATUSES[selectedOrder.status]?.label || selectedOrder.status}
                  </Badge>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Mode: <strong>{selectedOrder.order_type || 'Store'}</strong> {selectedOrder.table_number ? `(Table ${selectedOrder.table_number})` : ''}
                </div>
              </div>
            </div>

            {/* Product Details Section (Numbered list exactly as specified) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Ordered Products:
                </h4>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Total Items: {(selectedOrder.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 1), 0)}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {(selectedOrder.items || []).map((item, idx) => {
                  const pName = item.name || item.product_name || `Product #${item.product_id || item.id || idx + 1}`;
                  const qty = Number(item.quantity) || 1;
                  const price = Number(item.price ?? item.unit_price ?? 0);
                  const lineTotal = Number(item.subtotal ?? item.line_total ?? (price * qty));
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '0.9rem 1.1rem',
                        background: 'var(--bg-input, #F8FAFC)',
                        border: '1px solid var(--border-subtle, #E2E8F0)',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                        {idx + 1}. {pName}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: '0.5rem',
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                          paddingTop: '0.25rem',
                          borderTop: '1px dashed var(--border-subtle, #E2E8F0)',
                        }}
                      >
                        <div>
                          Quantity: <strong style={{ color: 'var(--text-primary)' }}>{qty}</strong>
                        </div>
                        <div>
                          Price: <strong style={{ color: 'var(--text-primary)' }}>₹{price.toLocaleString()} each</strong>
                        </div>
                        <div>
                          Subtotal: <strong style={{ color: 'var(--accent-emerald, #059669)', fontWeight: 700 }}>₹{lineTotal.toLocaleString()}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary & Payment Info Card */}
            <div
              style={{
                padding: '1rem 1.25rem',
                border: '1px solid var(--border-subtle, #E2E8F0)',
                borderRadius: '10px',
                background: 'var(--bg-surface, #FFFFFF)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Total Items:</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {(selectedOrder.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 1), 0)}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Subtotal:</span>
                <span>₹{Number(selectedOrder.subtotal || selectedOrder.total || 0).toLocaleString()}</span>
              </div>
              {Number(selectedOrder.discount || selectedOrder.discount_amount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-emerald, #059669)' }}>
                  <span>Discount Applied:</span>
                  <span>-₹{Number(selectedOrder.discount || selectedOrder.discount_amount).toLocaleString()}</span>
                </div>
              )}
              {Number(selectedOrder.tax || selectedOrder.tax_amount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Tax:</span>
                  <span>₹{Number(selectedOrder.tax || selectedOrder.tax_amount).toLocaleString()}</span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 800,
                  fontSize: '1.15rem',
                  color: 'var(--text-primary)',
                  borderTop: '1px solid var(--border-subtle, #E2E8F0)',
                  paddingTop: '0.65rem',
                  marginTop: '0.2rem',
                }}
              >
                <span>Order Total:</span>
                <span style={{ color: 'var(--primary-500, #1A2B49)' }}>
                  ₹{Number(selectedOrder.total || selectedOrder.total_amount || 0).toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px dashed var(--border-subtle, #E2E8F0)',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Payment Method: </span>
                  <strong>{selectedOrder.payment_method || 'CASH'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Payment Status: </span>
                  <strong style={{ color: selectedOrder.payment_status === 'PAID' ? 'var(--accent-emerald, #059669)' : 'var(--accent-amber, #D97706)' }}>
                    {selectedOrder.payment_status || 'PENDING'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Order Status: </span>
                  <strong>{ORDER_STATUSES[selectedOrder.status]?.label || selectedOrder.status}</strong>
                </div>
              </div>
            </div>

            {/* Lifecycle Pipeline Transition Buttons */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.45rem', display: 'block' }}>
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
