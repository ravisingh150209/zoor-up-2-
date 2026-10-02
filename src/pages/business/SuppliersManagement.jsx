import React, { useState, useEffect } from 'react';
import { Truck, Plus, Trash2, Phone, Mail, MapPin, IndianRupee } from 'lucide-react';
import { financeService } from '../../services/financeService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const SuppliersManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    products: '',
    outstanding_payment: 0,
  });

  const bizId = user?.business_id;

  useEffect(() => {
    loadSuppliers();
  }, [bizId]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await financeService.getSuppliers(bizId);
      setSuppliers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      addToast('Supplier Name and Phone are required', 'error');
      return;
    }
    try {
      await financeService.addSupplier(bizId, formData);
      addToast('Supplier added successfully!', 'success');
      setIsAddModalOpen(false);
      setFormData({ name: '', phone: '', email: '', address: '', products: '', outstanding_payment: 0 });
      loadSuppliers();
    } catch (e) {
      addToast('Error saving supplier', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await financeService.deleteSupplier(id);
      addToast('Supplier deleted', 'success');
      loadSuppliers();
    } catch (e) {
      addToast('Failed to delete supplier', 'error');
    }
  };

  const columns = [
    {
      header: 'Supplier Entity',
      accessor: 'name',
      render: (name, row) => (
        <div>
          <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{name}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Supplies: {row.products}
          </div>
        </div>
      ),
    },
    {
      header: 'Contact',
      accessor: 'phone',
      render: (phone, row) => (
        <div style={{ fontSize: '0.85rem' }}>
          <div>{phone}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{row.email}</div>
        </div>
      ),
    },
    {
      header: 'Location / Hub',
      accessor: 'address',
      render: (addr) => <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{addr}</span>,
    },
    {
      header: 'Outstanding Dues',
      accessor: 'outstanding_payment',
      render: (due) => (
        <div>
          <strong style={{ color: due > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
            ₹{due?.toLocaleString()}
          </strong>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {due > 0 ? 'Payment Due' : 'All Cleared'}
          </div>
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      render: (id) => (
        <Button variant="ghost" size="sm" onClick={() => handleDelete(id)}>
          <Trash2 size={15} className="text-rose-400" />
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Suppliers & Wholesalers</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Manage inventory vendor contacts, procurements, and credit ledger dues.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => setIsAddModalOpen(true)}>
          Add Supplier
        </Button>
      </div>

      {loading ? (
        <LoadingState message="Loading vendor catalog..." />
      ) : (
        <Table columns={columns} data={suppliers} />
      )}

      {/* Add Supplier Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Vendor / Supplier"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddSupplier}>
              Save Supplier
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <Input
            label="Supplier Company Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Sahyadri Agro Fresh Produce"
          />

          <div className="grid-2">
            <Input
              label="Contact Phone"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+91 99001 22334"
            />
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="sales@vendor.com"
            />
          </div>

          <Input
            label="Products / Materials Supplied"
            value={formData.products}
            onChange={(e) => setFormData({ ...formData, products: e.target.value })}
            placeholder="e.g. Organic ghee, grains, raw flours..."
          />

          <div className="grid-2">
            <Input
              label="Address / Depot Hub"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="City, State"
            />
            <Input
              label="Initial Outstanding Balance (₹)"
              type="number"
              value={formData.outstanding_payment}
              onChange={(e) => setFormData({ ...formData, outstanding_payment: e.target.value })}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
