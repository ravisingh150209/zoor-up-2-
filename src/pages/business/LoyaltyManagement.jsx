import React, { useState, useEffect } from 'react';
import { Award, Gift, Sparkles, CheckCircle2, ShieldCheck, IndianRupee, Plus } from 'lucide-react';
import { RANK_TIERS, loyaltyService } from '../../services/loyaltyService';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { ImageUploader } from '../../components/ui/ImageUploader';
import { EmptyState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const LoyaltyManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [rewards, setRewards] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    points: 500,
    value: 100,
    category: 'Voucher',
    image_url: null,
  });

  const bizId = user?.business_id;

  useEffect(() => {
    loadRewards();
  }, [bizId]);

  const loadRewards = async () => {
    try {
      const data = await loyaltyService.getRewards(bizId);
      setRewards(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setRewards([]);
    }
  };

  const handleCreateReward = async (e) => {
    e.preventDefault();
    if (!formData.title) {
      addToast('Reward title is required', 'error');
      return;
    }
    try {
      await loyaltyService.createReward(bizId, formData);
      addToast('New redeemable reward published!', 'success');
      setIsModalOpen(false);
      setFormData({
        title: '',
        points: 500,
        value: 100,
        category: 'Voucher',
        image_url: null,
      });
      loadRewards();
    } catch (e) {
      addToast('Error saving reward', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Loyalty & Customer Retention</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Rule: <strong>₹100 spending = 10 points</strong>. Points are securely credited upon completed delivery.
        </p>
      </div>

      {/* Rank Tiers Matrix */}
      <div>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Loyalty Tier Structure
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          {RANK_TIERS.map((tier) => (
            <Card
              key={tier.rank}
              style={{
                borderLeft: `4px solid ${tier.color}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '1.25rem 1rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {tier.rank}
                  </h4>
                  <Badge variant="neutral" style={{ fontSize: '0.7rem' }}>
                    {tier.max === Infinity ? '10,000+' : `${tier.min} - ${tier.max}`} pts
                  </Badge>
                </div>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {tier.perk}
                </p>
              </div>

              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Auto-assigned by spending volume
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Rewards Catalog */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <CardHeader
            title="Active Redeemable Rewards"
            subtitle="Customer rewards vouchers redeemable with accumulated points"
            icon={Gift}
            style={{ marginBottom: 0, paddingBottom: 0 }}
          />
          <Button variant="primary" icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
            Add Reward Item
          </Button>
        </div>

        {rewards.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="No rewards configured yet"
            description="Create your first loyalty reward voucher that customers can redeem with points or stamps."
            action={
              <Button variant="primary" icon={Plus} size="sm" onClick={() => setIsModalOpen(true)}>
                Add First Reward
              </Button>
            }
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem',
            }}
          >
            {rewards.map((rew) => (
              <div
                key={rew.id}
                style={{
                  padding: '1rem',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div>
                  {rew.image_url ? (
                    <div
                      style={{
                        height: '110px',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        marginBottom: '0.75rem',
                        background: '#000',
                      }}
                    >
                      <img
                        src={rew.image_url}
                        alt={rew.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        height: '70px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '0.75rem',
                        background: '#FEF3C7',
                        color: '#D97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Gift size={28} />
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary-400)', fontWeight: 600 }}>
                      {rew.category || 'Voucher'}
                    </span>
                    <Badge variant="warning">{rew.points} pts</Badge>
                  </div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {rew.title}
                  </h4>
                </div>

                <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Equivalent Value:</span>
                  <strong style={{ color: 'var(--accent-emerald)' }}>₹{rew.value || 100}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Reward Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Redeemable Reward"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateReward}>
              Save Reward
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateReward} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Reward Title"
            required
            placeholder="e.g. Free Organic Honey (250g)"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />

          <div className="grid-2">
            <Input
              label="Points Required"
              type="number"
              required
              value={formData.points}
              onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })}
            />
            <Input
              label="Equivalent Rupee Value (₹)"
              type="number"
              required
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
            />
          </div>

          <Input
            label="Category Tag"
            placeholder="e.g. Complimentary Product / Discount"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          />

          <div>
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem', display: 'block' }}>
              Reward Image (Optional)
            </label>
            <ImageUploader
              value={formData.image_url}
              onChange={(url) => setFormData({ ...formData, image_url: url })}
              aspectRatio="banner"
              allowCamera={true}
              allowGallery={true}
              placeholderText="Upload Reward Photo"
              subText="Choose from Gallery or Take Photo"
              entityType="reward"
              businessId={bizId}
              bucket="reward-images"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
