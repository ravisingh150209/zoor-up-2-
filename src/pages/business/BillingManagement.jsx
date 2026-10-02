import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Plus,
  Printer,
  Download,
  CheckCircle2,
  Clock,
  IndianRupee,
  Search,
  Eye,
  FileText
} from 'lucide-react';
import { billingService } from '../../services/billingService';
import { productService } from '../../services/productService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchBar, Tabs } from '../../components/ui/Controls';
import { LoadingState, EmptyState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const BillingManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // New Invoice Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [taxRate, setTaxRate] = useState(5);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [paymentStatus, setPaymentStatus] = useState('PAID');

  const bizId = user?.business_id;

  useEffect(() => {
    loadBillingData();
  }, [bizId, statusFilter, search]);

  const loadBillingData = async () => {
    setLoading(true);
    try {
      const invs = await billingService.getInvoices(bizId, {
        status: statusFilter,
        search,
      });
      const prods = await productService.getProducts(bizId);
      setInvoices(invs);
      setProducts(prods);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItemRow = () => {
    setInvoiceItems([...invoiceItems, { name: '', price: 0, quantity: 1 }]);
  };

  const handleUpdateItemRow = (index, field, value) => {
    const updated = [...invoiceItems];
    updated[index][field] = value;
    setInvoiceItems(updated);
  };

  const handleRemoveItemRow = (index) => {
    if (invoiceItems.length > 1) {
      setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
    }
  };

  const subtotal = invoiceItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
  const taxAmount = Math.round((subtotal * Number(taxRate)) / 100);
  const finalTotal = Math.max(0, subtotal + taxAmount - Number(discountAmount));

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    try {
      const inv = await billingService.createInvoice({
        business_id: bizId,
        customer_name: customerName,
        customer_phone: customerPhone,
        items: invoiceItems,
        subtotal,
        taxRate,
        discount_amount: discountAmount,
        payment_mode: paymentMode,
        payment_status: paymentStatus,
      });
      addToast(`Invoice ${inv.id} generated successfully!`, 'success');
      setIsCreateModalOpen(false);
      setSelectedInvoice(inv);
      loadBillingData();
    } catch (e) {
      addToast('Error generating invoice', 'error');
    }
  };

  const columns = [
    {
      header: 'Invoice #',
      accessor: 'id',
      render: (id) => <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-400)' }}>{id}</strong>,
    },
    {
      header: 'Billed To',
      accessor: 'customer_name',
      render: (name, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{row.customer_phone}</div>
        </div>
      ),
    },
    {
      header: 'Date',
      accessor: 'created_at',
      render: (date) => (
        <span style={{ fontSize: '0.8rem' }}>{new Date(date).toLocaleDateString()}</span>
      ),
    },
    {
      header: 'Amount',
      accessor: 'total_amount',
      render: (amount, row) => (
        <div>
          <strong style={{ fontSize: '0.95rem' }}>₹{amount}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.payment_mode}</div>
        </div>
      ),
    },
    {
      header: 'Payment Status',
      accessor: 'payment_status',
      render: (status) => (
        <Badge
          variant={
            status === 'PAID' ? 'success' : status === 'PARTIAL' ? 'warning' : 'danger'
          }
        >
          {status}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedInvoice(row);
            }}
          >
            <Eye size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedInvoice(row);
              setTimeout(() => window.print(), 200);
            }}
          >
            <Printer size={16} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Billing & POS Invoices</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Generate GST-compliant counter invoices, apply discounts, and export printable receipts.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => setIsCreateModalOpen(true)}>
          New Invoice / POS
        </Button>
      </div>

      <Tabs
        activeTab={statusFilter}
        onChange={setStatusFilter}
        tabs={[
          { id: 'ALL', label: 'All Invoices' },
          { id: 'PAID', label: 'Paid' },
          { id: 'UNPAID', label: 'Unpaid / Due' },
          { id: 'PARTIAL', label: 'Partial' },
        ]}
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search Invoice #, customer phone or name..."
      />

      {loading ? (
        <LoadingState message="Loading invoices ledger..." />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices found"
          description="Create your first invoice or check your filter criteria."
          actionText="Create Invoice"
          onAction={() => setIsCreateModalOpen(true)}
        />
      ) : (
        <Table
          columns={columns}
          data={invoices}
          onRowClick={(row) => setSelectedInvoice(row)}
        />
      )}

      {/* Create Invoice Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New POS Invoice"
        maxWidth="680px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateInvoice}>
              Generate & Record (₹{finalTotal})
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="grid-2">
            <Input
              label="Customer Name"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter customer name"
            />
            <Input
              label="Customer Mobile"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>

          {/* Line items table */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Itemized Bill Lines</label>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-primary-400 hover:underline text-xs font-semibold"
              >
                + Add Another Line
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {invoiceItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr auto',
                    gap: '0.5rem',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Item / Service Name"
                    value={item.name}
                    onChange={(e) => handleUpdateItemRow(idx, 'name', e.target.value)}
                  />
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Rate (₹)"
                    value={item.price}
                    onChange={(e) => handleUpdateItemRow(idx, 'price', e.target.value)}
                  />
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Qty"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleUpdateItemRow(idx, 'quantity', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveItemRow(idx)}
                    className="btn-ghost text-rose-400"
                    style={{ padding: '4px', minHeight: '38px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tax & Discount */}
          <div className="grid-3">
            <Input
              label="GST / Tax (%)"
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
            <Input
              label="Discount (₹)"
              type="number"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
            <Select
              label="Payment Mode"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              options={['UPI', 'ONLINE', 'CASH', 'CARD']}
            />
          </div>

          <div className="grid-2">
            <Select
              label="Payment Status"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              options={['PAID', 'UNPAID', 'PARTIAL']}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingTop: '1.5rem',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
              }}
            >
              Total Due: ₹{finalTotal}
            </div>
          </div>
        </form>
      </Modal>

      {/* Invoice Receipt Modal (Printable) */}
      {selectedInvoice && (
        <Modal
          isOpen={Boolean(selectedInvoice)}
          onClose={() => setSelectedInvoice(null)}
          title={`Invoice Receipt: ${selectedInvoice.id}`}
          maxWidth="560px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <Button variant="primary" icon={Printer} onClick={() => window.print()}>
                Print Tax Receipt
              </Button>
              <Button variant="secondary" onClick={() => setSelectedInvoice(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div
            id="printable-tax-invoice"
            style={{
              padding: '1.5rem',
              background: '#ffffff',
              color: '#1A2B49',
              borderRadius: 'var(--radius-lg)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {/* Store Receipt Header */}
            <div style={{ textAlign: 'center', borderBottom: '2px dashed #cbd5e1', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1A2B49' }}>
                {user?.business_name || 'Green Leaf Organic Mart'}
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                GSTIN: 29AABCU9603R1ZM • Indiranagar, Bengaluru
              </p>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', fontWeight: 700 }}>
                TAX INVOICE: {selectedInvoice.id}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Date: {new Date(selectedInvoice.created_at).toLocaleString()}
              </div>
            </div>

            {/* Billed To */}
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
              <div><strong>Billed to:</strong> {selectedInvoice.customer_name}</div>
              <div><strong>Contact:</strong> {selectedInvoice.customer_phone}</div>
              <div><strong>Payment Mode:</strong> {selectedInvoice.payment_mode} ({selectedInvoice.payment_status})</div>
            </div>

            {/* Items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', marginBottom: '1rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                  <th style={{ padding: '6px 0' }}>Item Description</th>
                  <th style={{ padding: '6px 0', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '6px 0', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoice.items?.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 0' }}>{it.name}</td>
                    <td style={{ padding: '6px 0', textAlign: 'center' }}>{it.quantity}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>₹{it.price * it.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Calculations */}
            <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '0.75rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span>₹{selectedInvoice.subtotal}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>GST Tax:</span>
                <span>₹{selectedInvoice.tax_amount}</span>
              </div>
              {selectedInvoice.discount_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
                  <span>Discount:</span>
                  <span>-₹{selectedInvoice.discount_amount}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', borderTop: '1px solid #cbd5e1', paddingTop: '6px', marginTop: '4px' }}>
                <span>Total Amount:</span>
                <span>₹{selectedInvoice.total_amount}</span>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
              *** Thank you for shopping with us! Generated via ZoorUp ***
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
