import React, { useState, useEffect } from 'react';
import {
  Warehouse,
  AlertTriangle,
  CheckCircle2,
  Package,
  IndianRupee,
  Plus,
  Minus,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react';
import { inventoryService } from '../../services/inventoryService';
import { productService } from '../../services/productService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchBar, Tabs } from '../../components/ui/Controls';
import { LoadingState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const InventoryManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('ALL');

  // Adjustment Modal
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustDelta, setAdjustDelta] = useState(5);
  const [adjustReason, setAdjustReason] = useState('PURCHASE');
  const [saving, setSaving] = useState(false);

  const bizId = user?.business_id;

  useEffect(() => {
    loadInventory();
  }, [bizId]);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const data = await inventoryService.getInventorySummary(bizId);
      setSummary(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setSaving(true);
    try {
      const delta = adjustReason === 'DAMAGE' ? -Math.abs(Number(adjustDelta)) : Number(adjustDelta);
      await productService.adjustStock(adjustTarget.id, delta, adjustReason);
      addToast(`Stock for ${adjustTarget.name} updated successfully!`, 'success');
      setAdjustTarget(null);
      loadInventory();
    } catch (e) {
      addToast('Error adjusting stock', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !summary) {
    return <LoadingState message="Calculating inventory valuations..." fullPage />;
  }

  let filteredProducts = summary.products || [];
  if (stockFilter === 'LOW_STOCK') {
    filteredProducts = filteredProducts.filter((p) => p.stock > 0 && p.stock <= 5);
  } else if (stockFilter === 'OUT_OF_STOCK') {
    filteredProducts = filteredProducts.filter((p) => p.stock === 0);
  }
  if (search) {
    const q = search.toLowerCase();
    filteredProducts = filteredProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))
    );
  }

  const columns = [
    {
      header: 'Product Item',
      accessor: 'name',
      render: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img
            src={row.image}
            alt={row.name}
            style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
          />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              SKU: {row.sku || 'N/A'} • {row.category}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Unit Cost (₹)',
      accessor: 'price',
      render: (price, row) => <span>₹{row.discount_price || price}</span>,
    },
    {
      header: 'In Stock',
      accessor: 'stock',
      render: (stock) => {
        if (stock === 0) return <Badge variant="danger">0 (Out of Stock)</Badge>;
        if (stock <= 5) return <Badge variant="warning">{stock} (Low Stock)</Badge>;
        return <Badge variant="success">{stock} units</Badge>;
      },
    },
    {
      header: 'Stock Valuation',
      accessor: 'stock',
      render: (stock, row) => (
        <strong style={{ color: 'var(--text-primary)' }}>
          ₹{(stock * (row.discount_price || row.price)).toLocaleString()}
        </strong>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      render: (_, row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setAdjustTarget(row);
            setAdjustDelta(5);
            setAdjustReason('PURCHASE');
          }}
        >
          Adjust Stock
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Inventory & Stock Alerts</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Track warehouse quantities, monitor low-stock thresholds, and log stock purchases or write-offs.
        </p>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid-stats">
        <div className="stat-card">
          <span className="stat-label">Stock Valuation</span>
          <div className="stat-value text-emerald-400">
            ₹{summary.totalStockValue.toLocaleString()}
          </div>
          <span className="stat-meta text-slate-400">Total assets in store</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Available Units</span>
          <div className="stat-value">{summary.availableStock}</div>
          <span className="stat-meta text-slate-400">{summary.totalProducts} unique SKUs</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Low Stock Warnings</span>
          <div className="stat-value text-amber-400">{summary.lowStockCount}</div>
          <span className="stat-meta text-amber-400">Needs replenishment</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Out of Stock</span>
          <div className="stat-value text-rose-400">{summary.outOfStockCount}</div>
          <span className="stat-meta text-rose-400">Immediate re-order</span>
        </div>
      </div>

      <Tabs
        activeTab={stockFilter}
        onChange={setStockFilter}
        tabs={[
          { id: 'ALL', label: 'All Items' },
          { id: 'LOW_STOCK', label: 'Low Stock Alert' },
          { id: 'OUT_OF_STOCK', label: 'Out of Stock' },
        ]}
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search product inventory by title, SKU..."
      />

      <Table columns={columns} data={filteredProducts} />

      {/* Stock Adjustment Modal */}
      {adjustTarget && (
        <Modal
          isOpen={Boolean(adjustTarget)}
          onClose={() => setAdjustTarget(null)}
          title={`Adjust Stock: ${adjustTarget.name}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAdjustTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={handleAdjustStock}>
                Confirm Adjustment
              </Button>
            </>
          }
        >
          <form onSubmit={handleAdjustStock} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              Current In-Stock Quantity: <strong>{adjustTarget.stock} units</strong>
            </div>

            <Select
              label="Reason for Adjustment"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              options={[
                { value: 'PURCHASE', label: 'New Stock Received / Purchase (+)' },
                { value: 'DAMAGE', label: 'Damaged / Expired Goods (-)' },
                { value: 'CORRECTION', label: 'Physical Audit Count Correction (+/-)' },
              ]}
            />

            <Input
              label={adjustReason === 'DAMAGE' ? 'Units to Deduct' : 'Units to Add'}
              type="number"
              min="1"
              required
              value={adjustDelta}
              onChange={(e) => setAdjustDelta(e.target.value)}
            />
          </form>
        </Modal>
      )}
    </div>
  );
};
