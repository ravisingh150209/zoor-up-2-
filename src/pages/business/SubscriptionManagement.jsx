import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Crown,
  Clock,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Zap,
  Shield,
  Star,
  Loader2,
} from 'lucide-react';
import { businessService } from '../../services/businessService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { LoadingState } from '../../components/ui/States';

const PLANS = [
  {
    id: 'FREE',
    name: 'Free',
    price: 0,
    interval: 'monthly',
    features: [
      'Basic POS & Billing',
      'Digital Menu QR',
      'Customer Loyalty (Basic)',
      'Up to 2 Gallery Images',
      'Email Support',
    ],
    limits: { gallery: 2, staff: 1 },
    popular: false,
  },
  {
    id: 'STARTER',
    name: 'Starter',
    price: 299,
    interval: 'monthly',
    features: [
      'Everything in Free',
      'Table Booking Management',
      'Inventory & Stock Alerts',
      'Up to 5 Gallery Images',
      'Priority Email Support',
      'Staff Management (2 users)',
    ],
    limits: { gallery: 5, staff: 2 },
    popular: false,
  },
  {
    id: 'GROWTH',
    name: 'Growth',
    price: 799,
    interval: 'monthly',
    features: [
      'Everything in Starter',
      'Advanced Analytics & Reports',
      'Custom Offers & Coupons',
      'Up to 15 Gallery Images',
      'Phone + Email Support',
      'Staff Management (5 users)',
      'Multi-location Support',
    ],
    limits: { gallery: 15, staff: 5 },
    popular: true,
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 1499,
    interval: 'monthly',
    features: [
      'Everything in Growth',
      'White-label Branding',
      'API Access',
      'Up to 50 Gallery Images',
      'Dedicated Support',
      'Unlimited Staff',
      'Custom Integrations',
    ],
    limits: { gallery: 50, staff: 999 },
    popular: false,
  },
  {
    id: 'PREMIUM',
    name: 'Premium',
    price: 2499,
    interval: 'monthly',
    features: [
      'Everything in Pro',
      'Custom Development Hours',
      'SLA Guarantee',
      'Unlimited Gallery',
      '24/7 Priority Support',
      'Account Manager',
      'Enterprise Features',
    ],
    limits: { gallery: 999, staff: 999 },
    popular: false,
  },
];

export const SubscriptionManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [subData, setSubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [billingInterval, setBillingInterval] = useState('monthly');

  useEffect(() => {
    loadSubscription();
  }, [user?.business_id]);

  const loadSubscription = async () => {
    if (!user?.business_id) return;
    setLoading(true);
    try {
      const data = await businessService.getSubscription(user.business_id);
      if (data) setSubData(data);
    } catch (e) {
      console.error('Failed to load subscription:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planId) => {
    if (!user?.business_id) return;
    setUpgrading(true);
    try {
      await businessService.updateSubscriptionTrial(user.business_id, {
        plan_id: planId,
      });
      addToast(`Successfully upgraded to ${planId} plan!`, 'success');
      loadSubscription();
    } catch (e) {
      addToast(e.message || 'Failed to upgrade plan', 'error');
    } finally {
      setUpgrading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'TRIAL': return '#F59E0B';
      case 'EXPIRED': return '#EF4444';
      case 'ACTIVE': return '#22C55E';
      default: return '#64748B';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'TRIAL': return 'Trial Active';
      case 'EXPIRED': return 'Trial Expired';
      case 'ACTIVE': return 'Active';
      default: return status;
    }
  };

  if (loading) {
    return <LoadingState message="Loading subscription details..." />;
  }

  const plan = (subData?.plan || 'FREE').toUpperCase();
  const status = subData?.subscription_status || 'ACTIVE';
  const isFree = plan === 'FREE';
  const isTrial = status === 'TRIAL';
  const isExpired = status === 'EXPIRED';
  const currentPlanData = PLANS.find(p => p.id === plan) || PLANS[0];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Current Subscription Header */}
      <Card style={{ background: 'linear-gradient(135deg, #1A2B49 0%, #0F172A 100%)', border: '1px solid #F59E0B', color: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Current Plan</h2>
              <Badge style={{ background: getStatusColor(status), color: '#FFFFFF', fontSize: '0.75rem' }}>
                {getStatusLabel(status)}
              </Badge>
            </div>
            <p style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0.5rem 0', lineHeight: 1.1 }}>
              {isFree ? 'Free' : `₹${currentPlanData.price}/${billingInterval === 'annual' ? 'yr' : 'mo'}`}
            </p>
            <p style={{ color: '#94A3B8', margin: 0 }}>
              {isTrial && subData?.trial_days_remaining !== undefined
                ? `⏳ ${subData.trial_days_remaining} days left in trial`
                : isExpired
                ? '⚠️ Trial expired — upgrade to restore premium features'
                : isFree
                ? 'Standard Free Plan'
                : '✓ Active subscription'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!isFree && !isExpired && (
              <Button variant="outline" icon={ArrowRight} onClick={() => setSelectedPlan(plan)}>
                Manage Plan
              </Button>
            )}
            {(isFree || isExpired) && (
              <Button variant="primary" icon={Crown} onClick={() => setSelectedPlan('STARTER')}>
                Upgrade Now
              </Button>
            )}
          </div>
        </div>

        {isTrial && subData?.trial_ends_at && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', border: '1px solid #F59E0B' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F59E0B' }}>
              <Clock size={16} />
              <span style={{ fontWeight: 600 }}>Trial ends: {new Date(subData.trial_ends_at).toLocaleDateString()}</span>
            </div>
          </div>
        )}
        </Card>

      {/* Plan Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {PLANS.map((p) => {
          const isCurrent = p.id === plan;
          const isUpgrade = PLANS.indexOf(p) > PLANS.indexOf(currentPlanData);
          const annualPrice = Math.round(p.price * 12 * 0.833); // ~17% discount
          return (
            <Card
              key={p.id}
              style={{
                border: isCurrent ? '2px solid #F59E0B' : p.popular ? '2px solid #8B5CF6' : '1px solid #E2E8F0',
                background: isCurrent ? '#FEF3C7' : p.popular ? '#F5F3FF' : '#FFFFFF',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {p.popular && (
                <div style={{ position: 'absolute', top: 0, right: 0, background: '#8B5CF6', color: '#FFFFFF', padding: '0.25rem 0.75rem', borderRadius: '0 0 0 8px', fontSize: '0.7rem', fontWeight: 700 }}>
                  MOST POPULAR
                </div>
              )}
              {isCurrent && !isFree && (
                <div style={{ position: 'absolute', top: 0, left: 0, background: '#F59E0B', color: '#1A2B49', padding: '0.25rem 0.75rem', borderRadius: '0 0 8px 0', fontSize: '0.7rem', fontWeight: 700 }}>
                  CURRENT
                </div>
              )}

              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>{p.name}</h3>
                  <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                    {p.price === 0 ? 'Free forever' : `₹${p.price}/${billingInterval === 'annual' ? 'yr' : 'mo'}`}
                  </p>
                  {p.price > 0 && billingInterval === 'annual' && (
                    <p style={{ color: '#059669', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
                      ₹{annualPrice}/yr (Save ~17%)
                    </p>
                  )}
                </div>

                <ul style={{ flex: 1, margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {p.features.map((f, i) => (
                    <li key={i} style={{ fontSize: '0.85rem', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <CheckCircle2 size={16} style={{ color: '#10B981', flexShrink: 0, marginTop: '2px' }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748B' }}>
                    <span>Gallery Limit</span>
                    <strong>{p.limits.gallery >= 999 ? 'Unlimited' : p.limits.gallery}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748B' }}>
                    <span>Staff Users</span>
                    <strong>{p.limits.staff >= 999 ? 'Unlimited' : p.limits.staff}</strong>
                  </div>
                </div>
              </div>

              <div style={{ padding: '0 1.5rem 1.5rem' }}>
                <Button
                  variant={isCurrent ? 'outline' : isUpgrade ? 'primary' : 'secondary'}
                  fullWidth
                  icon={ArrowRight}
                  onClick={() => setSelectedPlan(p.id)}
                  disabled={isCurrent}
                  loading={upgrading && selectedPlan === p.id}
                >
                  {isCurrent ? 'Current Plan' : isUpgrade ? 'Upgrade' : 'Downgrade'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Upgrade Confirmation Modal */}
      {selectedPlan && (
        <div className="modal-overlay" onClick={() => setSelectedPlan(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '2rem', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Crown size={28} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
                {plan === 'FREE' ? 'Start Trial' : 'Change Plan'}
              </h3>
              <p style={{ color: '#64748B', margin: '0.5rem 0 0' }}>
                Switch to <strong>{selectedPlan}</strong> plan?
              </p>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Monthly</span>
                <strong>₹{PLANS.find(p => p.id === selectedPlan)?.price || 0}/mo</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#059669' }}>
                <span>Annual (Save ~17%)</span>
                <strong>₹{Math.round((PLANS.find(p => p.id === selectedPlan)?.price || 0) * 12 * 0.833)}/yr</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button variant="secondary" fullWidth onClick={() => setSelectedPlan(null)}>
                Cancel
              </Button>
              <Button variant="primary" fullWidth onClick={() => handleUpgrade(selectedPlan)} loading={upgrading}>
                Confirm & {plan === 'FREE' ? 'Start Trial' : 'Upgrade'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Billing Interval Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="radio" checked={billingInterval === 'monthly'} onChange={() => setBillingInterval('monthly')} />
          <span>Monthly</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="radio" checked={billingInterval === 'annual'} onChange={() => setBillingInterval('annual')} />
          <span>Annual (Save ~17%)</span>
        </label>
      </div>
    </div>
  );
};