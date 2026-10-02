import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Clock,
  Layers,
  CheckCircle2,
  AlertTriangle,
  QrCode
} from 'lucide-react';
import { productService } from '../../services/productService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SearchBar, Tabs, ConfirmationDialog } from '../../components/ui/Controls';
import { LoadingState, EmptyState } from '../../components/ui/States';
import { ImageUploader } from '../../components/ui/ImageUploader';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const ProductsServices = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [formData, setFormData] = useState({
    type: 'product',
    name: '',
    category: 'Dairy & Pantry',
    price: '',
    discount_price: '',
    stock: 20,
    sku: '',
    barcode: '',
    duration_mins: 60,
    brand: '',
    image: null,
    image_url: null,
    description: '',
    active: true,
  });

  const bizId = user?.business_id;

  useEffect(() => {
    loadItems();
  }, [bizId, activeTab, search]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await productService.getProducts(bizId, {
        type: activeTab,
        search,
      });
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ ...item });
    } else {
      setEditingItem(null);
      setFormData({
        type: activeTab === 'service' ? 'service' : 'product',
        name: '',
        category: 'General',
        price: '',
        discount_price: '',
        stock: 20,
        sku: `SKU-${Date.now().toString(36).toUpperCase()}`,
        barcode: `${Date.now()}`,
        duration_mins: 60,
        brand: '',
        image: null,
        image_url: null,
        description: '',
        active: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price) {
      addToast('Name and price are required', 'error');
      return;
    }

    try {
      if (editingItem) {
        await productService.updateProduct(editingItem.id, formData);
        addToast('Catalog item updated successfully!', 'success');
      } else {
        await productService.addProduct(bizId, formData);
        addToast('New item added to catalog!', 'success');
      }
      setIsModalOpen(false);
      loadItems();
    } catch (e) {
      addToast('Error saving catalog item', 'error');
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    try {
      await productService.deleteProduct(deleteTarget.id);
      addToast('Catalog item deleted', 'success');
      setDeleteTarget(null);
      loadItems();
    } catch (e) {
      addToast('Failed to delete item', 'error');
    }
  };

  const columns = [
    {
      header: 'Item',
      accessor: 'name',
      render: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {(row.image_url || row.image) ? (
            <img
              src={row.image_url || row.image}
              alt={row.name}
              style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-accent-light)',
                border: '1px solid #FDE68A',
                color: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Package size={20} />
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {row.category} {row.brand && `• ${row.brand}`}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Type',
      accessor: 'type',
      render: (type) => (
        <Badge variant={type === 'service' ? 'info' : 'primary'}>
          {type === 'service' ? 'Service' : 'Product'}
        </Badge>
      ),
    },
    {
      header: 'Price (₹)',
      accessor: 'price',
      render: (price, row) => (
        <div>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            ₹{row.discount_price || price}
          </span>
          {row.discount_price && row.discount_price < price && (
            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '6px' }}>
              ₹{price}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Inventory / Duration',
      accessor: 'stock',
      render: (stock, row) => {
        if (row.type === 'service') {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <Clock size={14} />
              <span>{row.duration_mins || 60} mins</span>
            </div>
          );
        }
        if (stock === 0) return <Badge variant="danger">Out of Stock</Badge>;
        if (stock <= 5) return <Badge variant="warning">Low Stock ({stock})</Badge>;
        return <Badge variant="success">{stock} units</Badge>;
      },
    },
    {
      header: 'Status',
      accessor: 'active',
      render: (active) => (
        <Badge variant={active ? 'success' : 'neutral'}>
          {active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
          <button
            onClick={() => handleOpenModal(row)}
            className="btn-ghost"
            style={{ padding: '6px', minHeight: '32px' }}
            title="Edit item"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => setDeleteTarget(row)}
            className="btn-ghost text-rose-400"
            style={{ padding: '6px', minHeight: '32px' }}
            title="Delete item"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Products & Services Catalog</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Manage sellable goods, barcodes, inventory alerts and appointment-based services.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => handleOpenModal()}>
          Add New Item
        </Button>
      </div>

      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'ALL', label: 'All Catalog' },
          { id: 'product', label: 'Physical Products' },
          { id: 'service', label: 'Bookable Services' },
        ]}
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search products by title, SKU, category, or barcode..."
      />

      {loading ? (
        <LoadingState message="Loading catalog items..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Catalog is empty"
          description="Add your first product or service to appear on the digital QR menu."
          actionText="Create Item"
          onAction={() => handleOpenModal()}
        />
      ) : (
        <Table columns={columns} data={items} />
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? `Edit: ${editingItem.name}` : 'Add Catalog Item'}
        maxWidth="640px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveItem}>
              {editingItem ? 'Save Changes' : 'Add to Catalog'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveItem} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="grid-2">
            <Select
              label="Item Type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              options={[
                { value: 'product', label: 'Physical Product (Stock tracked)' },
                { value: 'service', label: 'Bookable Service (Time-based)' },
              ]}
            />
            <Input
              label="Item Name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Organic Gir Cow Ghee"
            />
          </div>

          <div className="grid-3">
            <Input
              label="Category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g. Bakery / Hair Care"
            />
            <Input
              label="Regular Price (₹)"
              type="number"
              required
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            />
            <Input
              label="Special Discount Price (₹)"
              type="number"
              value={formData.discount_price}
              onChange={(e) => setFormData({ ...formData, discount_price: e.target.value })}
            />
          </div>

          {formData.type === 'product' ? (
            <div className="grid-3">
              <Input
                label="Available Stock"
                type="number"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
              />
              <Input
                label="SKU Code"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              />
              <Input
                label="Barcode / EAN"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              />
            </div>
          ) : (
            <div className="grid-2">
              <Input
                label="Duration (Minutes)"
                type="number"
                value={formData.duration_mins}
                onChange={(e) => setFormData({ ...formData, duration_mins: Number(e.target.value) })}
              />
              <Input
                label="Service Tag / Code"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              />
            </div>
          )}

          <div>
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem', display: 'block' }}>
              Product / Menu Photo
            </label>
            <ImageUploader
              value={formData.image_url || formData.image}
              onChange={(url) => setFormData({ ...formData, image_url: url, image: url })}
              aspectRatio="product"
              allowCamera={true}
              allowGallery={true}
              placeholderText="Upload Product Photo"
              subText="Choose from Gallery or Take Photo"
              entityType="product"
              businessId={bizId}
              bucket="product-images"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Item Description</label>
            <textarea
              rows={2}
              className="form-textarea"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ingredients, usage guidelines, or specifications..."
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary-500)' }}
            />
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Available for Online Ordering</span>
          </label>
        </form>
      </Modal>

      {/* Delete Item Confirmation */}
      <ConfirmationDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteItem}
        title="Remove Catalog Item"
        message={`Are you sure you want to delete ${deleteTarget?.name}? It will be removed from your digital storefront.`}
        danger
      />
    </div>
  );
};
