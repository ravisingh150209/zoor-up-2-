import React, { useState, useEffect } from 'react';
import { Tag, Plus, Power, Trash2, Calendar, IndianRupee, Percent } from 'lucide-react';
import { loyaltyService } from '../../services/loyaltyService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ImageUploader } from '../../components/ui/ImageUploader';
import { LoadingState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const OffersManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    title: '',
    discount_type: 'PERCENTAGE',
    discount_val: 10,
    min_order: 499,
    max_discount: 150,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '2026-12-31',
    usage_limit: 200,
    image_url: null,
  });

  const bizId = user?.business_id;

  useEffect(() => {
    loadOffers();
  }, [bizId]);

  const loadOffers = async () => {
    setLoading(true);
    try {
      const data = await loyaltyService.getAllOffersForBusiness(bizId);
      setOffers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOffer = async (e) => {
    e.preventDefault();
    if (!formData.code || !formData.discount_val) {
      addToast('Coupon code and discount amount are required', 'error');
      return;
    }
    try {
      await loyaltyService.createOffer(bizId, formData);
      addToast(`Promo code ${formData.code.toUpperCase()} launched!`, 'success');
      setIsAddModalOpen(false);
      setFormData({
        code: '',
        title: '',
        discount_type: 'PERCENTAGE',
        discount_val: 10,
        min_order: 499,
        max_discount: 150,
        start_date: new Date().toISOString().split('T')[0],
        end_date: '2026-12-31',
        usage_limit: 200,
      });
      loadOffers();
    } catch (e) {
      addToast('Error saving promotional offer', 'error');
    }
  };

  const handleToggle = async (id) => {
    try {
      await loyaltyService.toggleOffer(id);
      addToast('Coupon status updated', 'info');
      loadOffers();
    } catch (e) {
      addToast('Error toggling coupon', 'error');
    }
  };

  const columns = [
    {
      header: 'Coupon Code',
      accessor: 'code',
      render: (code, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {(row.image_url || row.image) ? (
            <img
              src={row.image_url || row.image}
              alt={code}
              style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-light)', border: '1px solid #FDE68A', color: 'var(--color-accent-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Tag size={16} />
            </div>
          )}
          <div>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: '#1A2B49' }}>
              {code}
            </strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{row.title}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Benefit',
      accessor: 'discount_val',
      render: (val, row) => (
        <strong style={{ color: 'var(--accent-emerald)' }}>
          {row.discount_type === 'PERCENTAGE' ? `${val}% OFF` : `₹${val} FLAT OFF`}
        </strong>
      ),
    },
    {
      header: 'Order Condition',
      accessor: 'min_order',
      render: (minOrder, row) => (
        <span style={{ fontSize: '0.8rem' }}>
          Min: ₹{minOrder} {row.max_discount > 0 && `(Max: ₹${row.max_discount})`}
        </span>
      ),
    },
    {
      header: 'Redemptions',
      accessor: 'times_used',
      render: (times, row) => (
        <span style={{ fontSize: '0.8rem' }}>
          {times} / {row.usage_limit} uses
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'active',
      render: (active) => (
        <Badge variant={active ? 'success' : 'neutral'}>
          {active ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
    {
      header: 'Action',
      accessor: 'id',
      align: 'right',
      render: (id, row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleToggle(id)}
          title={row.active ? 'Disable Coupon' : 'Enable Coupon'}
        >
          <Power size={15} className={row.active ? 'text-emerald-400' : 'text-slate-500'} />
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Promotional Offers & Coupons</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Create percentage discounts, flat deals, and minimum basket requirements for customer checkouts.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => setIsAddModalOpen(true)}>
          Create Coupon
        </Button>
      </div>

      {loading ? (
        <LoadingState message="Loading promo offers..." />
      ) : (
        <Table columns={columns} data={offers} />
      )}

      {/* Add Coupon Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Create Promo Coupon"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateOffer}>
              Publish Coupon
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateOffer} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="grid-2">
            <Input
              label="Coupon Code"
              required
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g. FESTIVE20"
            />
            <Input
              label="Campaign Title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. 20% Off Groceries"
            />
          </div>

          <div className="grid-3">
            <Select
              label="Discount Type"
              value={formData.discount_type}
              onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
              options={[
                { value: 'PERCENTAGE', label: 'Percentage (%)' },
                { value: 'FIXED', label: 'Fixed Flat (₹)' },
              ]}
            />
            <Input
              label={formData.discount_type === 'PERCENTAGE' ? 'Discount Rate (%)' : 'Flat Discount (₹)'}
              type="number"
              required
              value={formData.discount_val}
              onChange={(e) => setFormData({ ...formData, discount_val: e.target.value })}
            />
            <Input
              label="Minimum Order Value (₹)"
              type="number"
              value={formData.min_order}
              onChange={(e) => setFormData({ ...formData, min_order: e.target.value })}
            />
          </div>

          <div className="grid-3">
            <Input
              label="Max Discount Cap (₹)"
              type="number"
              value={formData.max_discount}
              onChange={(e) => setFormData({ ...formData, max_discount: e.target.value })}
            />
            <Input
              label="Expiry Date"
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            />
            <Input
              label="Total Redemptions Limit"
              type="number"
              value={formData.usage_limit}
              onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem', display: 'block' }}>
              Offer / Coupon Banner Photo
            </label>
            <ImageUploader
              value={formData.image_url}
              onChange={(url) => setFormData({ ...formData, image_url: url })}
              aspectRatio="banner"
              allowCamera={true}
              allowGallery={true}
              placeholderText="Upload Coupon Banner"
              subText="Choose from Gallery or Take Photo"
              entityType="offer"
              businessId={bizId}
              bucket="offer-images"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
