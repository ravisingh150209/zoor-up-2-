import React, { useState, useEffect } from 'react';
import { Zap, Check, Edit2, Plus, Save, ShieldCheck, RefreshCw } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';

export const AdminPlans = () => {
  const { addToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [editingPlan, setEditingPlan] = useState(null);
  const [loadingSubs, setLoadingSubs] = useState(false);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    const list = await adminService.getPlans();
    setPlans(list);
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    if (!editingPlan) return;
    try {
      await adminService.updatePlan(editingPlan.id, editingPlan);
      addToast(`Updated ${editingPlan.name} plan pricing & quotas!`, 'success');
      setEditingPlan(null);
      loadPlans();
    } catch (e) {
      addToast('Error saving plan', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>SaaS Subscription Plans & Pricing</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Configure monthly merchant tiers, pricing, customer database quotas, and staff limits.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {plans.map((p) => (
          <Card
            key={p.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '1.5rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{p.name}</h3>
                {p.recommended && <Badge variant="primary">Popular</Badge>}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900 }}>₹{p.price}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>/ month</span>
              </div>

              <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                <div>Customer Limit: <strong>{p.customerLimit.toLocaleString()}</strong></div>
                <div>Staff Accounts: <strong>{p.staffLimit}</strong></div>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {p.features.map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                    <Check size={14} className="text-emerald-400 mt-1 flex-shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <Button
                variant="secondary"
                block
                icon={Edit2}
                onClick={() => setEditingPlan({ ...p })}
              >
                Edit Pricing & Limits
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Edit Plan Modal */}
      {editingPlan && (
        <Modal
          isOpen={Boolean(editingPlan)}
          onClose={() => setEditingPlan(null)}
          title={`Edit ${editingPlan.name} Plan`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditingPlan(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSavePlan}>
                Save Plan Changes
              </Button>
            </>
          }
        >
          <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="grid-2">
              <Input
                label="Plan Display Name"
                required
                value={editingPlan.name}
                onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
              />
              <Input
                label="Monthly Price (₹)"
                type="number"
                required
                value={editingPlan.price}
                onChange={(e) => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })}
              />
            </div>

            <div className="grid-2">
              <Input
                label="Customer Database Limit"
                type="number"
                required
                value={editingPlan.customerLimit}
                onChange={(e) => setEditingPlan({ ...editingPlan, customerLimit: Number(e.target.value) })}
              />
              <Input
                label="Staff Login Limit"
                type="number"
                required
                value={editingPlan.staffLimit}
                onChange={(e) => setEditingPlan({ ...editingPlan, staffLimit: Number(e.target.value) })}
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};