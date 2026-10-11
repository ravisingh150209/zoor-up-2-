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
  Lock,
} from 'lucide-react';
import { businessService } from '../../services/businessService';
import { paymentService } from '../../services/paymentService';
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
    annualPrice: 0,
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
    annualPrice: 2990,
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
    annualPrice: 7990,
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
    annualPrice: 14990,
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
    annualPrice: 24990,
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

// Dynamically load Razorpay SDK
const loadRazorpayScript = () => {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script. Please check your connection.'));
    document.body.appendChild(script);
  });
};

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

  // Trial activation (when eligible)
  const handleTrialUpgrade = async (planId) => {
    if (!user?.business_id) return;
    setUpgrading(true);
    try {
      await businessService.updateSubscriptionTrial(user.business_id, {
        plan_id: planId,
      });
      addToast(`Successfully activated trial for ${planId} plan!`, 'success');
      setSelectedPlan(null);
      await loadSubscription();
    } catch (e) {
      addToast(e.message || 'Failed to activate trial', 'error');
    } finally {
      setUpgrading(false);
    }
  };

  // Razorpay payment for subscriptions
  const handleRazorpayPayment = async (planId) => {
    if (!user?.business_id) return;
    setUpgrading(true);
    try {
      if (planId === 'FREE') {
        await businessService.updateSubscriptionTrial(user.business_id, {
          plan_id: 'FREE',
        });
        addToast('Switched to Free plan successfully.', 'success');
        setSelectedPlan(null);
        await loadSubscription();
        return;
      }

      // 1. Create Razorpay order on backend (reusing existing Razorpay merchant account)
      const rzpOrder = await paymentService.createSubscriptionRazorpayOrder({
        plan_id: planId,
        billing_interval: billingInterval,
        business_id: user.business_id,
      });

      if (!rzpOrder?.razorpay_order_id || !rzpOrder?.razorpay_key_id) {
        throw new Error(rzpOrder?.error || 'Failed to initialize Razorpay payment');
      }

      // 2. Load Razorpay Checkout SDK
      await loadRazorpayScript();

      // 3. Launch Checkout Modal
      const options = {
        key: rzpOrder.razorpay_key_id,
        amount: rzpOrder.amount_paise,
        currency: 'INR',
        name: 'ZOOR UP',
        description: `Subscription: ${rzpOrder.plan_name || planId} Plan (${billingInterval === 'annual' ? 'Annual' : 'Monthly'})`,
        order_id: rzpOrder.razorpay_order_id,
        prefill: {
          name: user?.name || user?.business_name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        notes: {
          type: 'BUSINESS_SUBSCRIPTION',
          business_id: user.business_id,
          plan_id: planId.toLowerCase(),
          billing_interval: billingInterval,
        },
        theme: {
          color: '#00B89C',
        },
        handler: async (response) => {
          try {
            setUpgrading(true);
            const verifyRes = await paymentService.verifySubscriptionRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan_id: planId,
              billing_interval: billingInterval,
              business_id: user.business_id,
            });

            if (verifyRes?.success) {
              addToast(`🎉 ${planId} Subscription Activated Successfully!`, 'success');
              setSelectedPlan(null);
              await loadSubscription();
            } else {
              throw new Error(verifyRes?.error || 'Subscription verification failed.');
            }
          } catch (verifyErr) {
            console.error('Subscription verification error:', verifyErr);
            addToast(verifyErr.message || 'Payment verification failed. Please contact support.', 'error');
          } finally {
            setUpgrading(false);
          }
        },
        modal: {
          ondismiss: () => {
            paymentService.recordSubscriptionRazorpayFailure({
              razorpay_order_id: rzpOrder.razorpay_order_id,
              error_code: 'MODAL_DISMISSED',
              error_description: 'User dismissed Razorpay checkout',
            });
            setUpgrading(false);
            addToast('Subscription payment cancelled.', 'info');
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        paymentService.recordSubscriptionRazorpayFailure({
          razorpay_order_id: rzpOrder.razorpay_order_id,
          error_code: resp?.error?.code,
          error_description: resp?.error?.description,
        });
        setUpgrading(false);
        addToast(resp?.error?.description || 'Subscription payment failed.', 'error');
      });
      rzp.open();
    } catch (e) {
      console.error('Subscription Razorpay error:', e);
      addToast(e.message || 'Failed to start payment', 'error');
      setUpgrading(false);
    }
  };

  const getStatusColor = (status, paymentStatus) => {
    if (paymentStatus === 'PAID') return '#10B981';
    switch (status) {
      case 'TRIAL': return '#F59E0B';
      case 'EXPIRED': return '#EF4444';
      case 'ACTIVE': return '#10B981';
      default: return '#64748B';
    }
  };

  const getStatusLabel = (status, paymentStatus) => {
    if (paymentStatus === 'PAID') return 'Paid & Active';
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
  const paymentStatus = subData?.payment_status || 'FREE';
  const isFree = plan === 'FREE';
  const isPaid = paymentStatus === 'PAID';
  const isTrial = status === 'TRIAL' && !isPaid;
  const isExpired = status === 'EXPIRED';
  const currentPlanData = PLANS.find(p => p.id === plan) || PLANS[0];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Current Subscription Header */}
      <Card style={{ background: 'linear-gradient(135deg, #1A2B49 0%, #0F172A 100%)', border: '1px solid #F59E0B', color: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Current Plan: {plan}</h2>
              <Badge style={{ background: getStatusColor(status, paymentStatus), color: '#FFFFFF', fontSize: '0.75rem' }}>
                {getStatusLabel(status, paymentStatus)}
              </Badge>
            </div>
            <p style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0.5rem 0', lineHeight: 1.1 }}>
              {isFree ? 'Free' : `₹${billingInterval === 'annual' ? currentPlanData.annualPrice : currentPlanData.price}/${billingInterval === 'annual' ? 'yr' : 'mo'}`}
            </p>
            <p style={{ color: '#94A3B8', margin: 0 }}>
              {isPaid
                ? '✓ Active paid subscription (Powered by Razorpay)'
                : isTrial && subData?.trial_days_remaining !== undefined
                ? `⏳ ${subData.trial_days_remaining} days left in free trial`
                : isExpired
                ? '⚠️ Trial expired — subscribe to restore premium features'
                : isFree
                ? 'Standard Free Plan'
                : '✓ Active subscription'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!isFree && !isExpired && (
              <Button variant="outline" icon={ArrowRight} onClick={() => setSelectedPlan(plan)}>
                Change Plan
              </Button>
            )}
            {(isFree || isExpired) && (
              <Button variant="primary" icon={Crown} onClick={() => setSelectedPlan('GROWTH')}>
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
          const displayPrice = billingInterval === 'annual' ? p.annualPrice : p.price;
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
              {isCurrent && (
                <div style={{ position: 'absolute', top: 0, left: 0, background: '#F59E0B', color: '#1A2B49', padding: '0.25rem 0.75rem', borderRadius: '0 0 8px 0', fontSize: '0.7rem', fontWeight: 700 }}>
                  CURRENT PLAN
                </div>
              )}

              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>{p.name}</h3>
                  <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                    {p.price === 0 ? 'Free forever' : `₹${displayPrice}/${billingInterval === 'annual' ? 'yr' : 'mo'}`}
                  </p>
                  {p.price > 0 && billingInterval === 'annual' && (
                    <p style={{ color: '#059669', fontSize: '0.8rem', margin: '0.25rem 0 0', fontWeight: 600 }}>
                      Save ~17% with Annual Billing
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
                  icon={p.price > 0 ? CreditCard : ArrowRight}
                  onClick={() => setSelectedPlan(p.id)}
                  disabled={isCurrent && isPaid}
                  loading={upgrading && selectedPlan === p.id}
                >
                  {isCurrent && isPaid ? 'Active Plan' : isCurrent ? 'Renew / Subscribe' : isUpgrade ? 'Upgrade with Razorpay' : 'Switch Plan'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Upgrade / Subscribe Modal */}
      {selectedPlan && (
        <div className="modal-overlay" onClick={() => !upgrading && setSelectedPlan(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: '16px', padding: '2rem', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Crown size={28} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
                {selectedPlan === 'FREE' ? 'Switch to Free Plan' : `Subscribe to ${selectedPlan}`}
              </h3>
              <p style={{ color: '#64748B', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
                {selectedPlan === 'FREE'
                  ? 'Switch to Free tier? Premium features will be paused.'
                  : `Secure online payment powered by existing Razorpay merchant account.`}
              </p>
            </div>

            {selectedPlan !== 'FREE' && (
              <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#64748B' }}>Selected Plan</span>
                  <strong>{selectedPlan}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#64748B' }}>Billing Cycle</span>
                  <strong style={{ textTransform: 'capitalize' }}>{billingInterval}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, paddingTop: '0.5rem', borderTop: '1px solid #E2E8F0' }}>
                  <span style={{ color: '#1A2B49' }}>Total Amount</span>
                  <span style={{ color: '#00B89C' }}>
                    ₹{billingInterval === 'annual'
                      ? (PLANS.find(p => p.id === selectedPlan)?.annualPrice || 0)
                      : (PLANS.find(p => p.id === selectedPlan)?.price || 0)}
                  </span>
                </div>
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#64748B' }}>
                  <Lock size={14} color="#00B89C" />
                  <span>256-bit SSL encrypted. Exact same Razorpay account as customer orders.</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button variant="secondary" fullWidth onClick={() => setSelectedPlan(null)} disabled={upgrading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={() => handleRazorpayPayment(selectedPlan)}
                loading={upgrading}
                icon={selectedPlan === 'FREE' ? ArrowRight : CreditCard}
              >
                {selectedPlan === 'FREE'
                  ? 'Confirm Free Plan'
                  : `Pay ₹${billingInterval === 'annual' ? (PLANS.find(p => p.id === selectedPlan)?.annualPrice || 0) : (PLANS.find(p => p.id === selectedPlan)?.price || 0)} via Razorpay`}
              </Button>
            </div>

            {selectedPlan !== 'FREE' && !subData?.trial_used && (
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleTrialUpgrade(selectedPlan)}
                  disabled={upgrading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#F59E0B',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Or start 30-Day Free Trial (No Card Required)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Billing Interval Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: billingInterval === 'monthly' ? 700 : 400 }}>
          <input
            type="radio"
            name="billingInterval"
            checked={billingInterval === 'monthly'}
            onChange={() => setBillingInterval('monthly')}
          />
          <span>Monthly Billing</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: billingInterval === 'annual' ? 700 : 400 }}>
          <input
            type="radio"
            name="billingInterval"
            checked={billingInterval === 'annual'}
            onChange={() => setBillingInterval('annual')}
          />
          <span>Annual Billing <span style={{ color: '#059669', fontWeight: 700 }}>(Save ~17%)</span></span>
        </label>
      </div>
    </div>
  );
};