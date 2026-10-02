import React, { useState, useEffect } from 'react';
import { Zap, Check, Edit2, Plus, Save, ShieldCheck, RefreshCw, CreditCard } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { subscriptionService } from '../../services/subscriptionService';
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
  const [subscriptions, setSubscriptions] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  useEffect(() => {
    loadPlans();
    loadSubscriptions();
  }, []);

  const loadPlans = async () => {
    const list = await adminService.getPlans();
    setPlans(list);
  };

  const loadSubscriptions = async () => {
    setLoadingSubs(true);
    try {
      const list = await subscriptionService.getAdminSubscriptions();
      setSubscriptions(list);
    } catch (e) {
      console.warn('Failed to load admin subscriptions:', e);
    } finally {
      setLoadingSubs(false);
    }
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

      {/* SECTION 20: PLATFORM ADMIN SUBSCRIPTIONS INSPECTION TABLE */}
      <Card style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Platform Subscriptions & Mandates</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Server-authoritative subscription state across all merchant accounts ({subscriptions.length} active records)
            </span>
          </div>
          <Button size="sm" variant="outline" icon={RefreshCw} onClick={loadSubscriptions} loading={loadingSubs}>
            Refresh
          </Button>
        </div>

        {subscriptions.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No business subscriptions recorded on the platform yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Subscription ID</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Business</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Plan</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Amount</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Auto-renew</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Next Billing</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Payment Status</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Provider Ref</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.65rem 0.5rem', fontFamily: 'monospace', fontWeight: 600 }}>
                      {s.subscription_id || '-'}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>
                      {s.business_name || s.business_id}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', fontWeight: 700 }}>
                      {s.plan}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      ₹{s.amount}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      <Badge variant={s.status === 'ACTIVE' ? 'success' : 'secondary'}>
                        {s.status}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      {s.auto_renew ? (
                        <span style={{ color: '#10B981', fontWeight: 600 }}>ON</span>
                      ) : (
                        <span style={{ color: '#EF4444', fontWeight: 600 }}>OFF</span>
                      )}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      {s.next_billing_date ? new Date(s.next_billing_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem' }}>
                      <Badge variant={s.payment_status === 'PAID' ? 'success' : s.payment_status === 'FREE' ? 'secondary' : 'warning'}>
                        {s.payment_status}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {s.provider_subscription_id || s.provider || '-'}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', color: 'var(--text-secondary)' }}>
                      {s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
