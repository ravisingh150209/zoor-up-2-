import React, { useState, useEffect } from 'react';
import {
  Zap,
  Check,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Clock,
  CreditCard,
  CheckCircle2,
  Lock,
  Calendar,
  RefreshCw,
  XCircle,
  ExternalLink,
  History,
  FileText,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Info,
  WifiOff,
  LogIn,
  Copy,
  QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { useNavigate } from 'react-router-dom';
import { subscriptionService } from '../../services/subscriptionService';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LoadingState } from '../../components/ui/States';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const SubscriptionPage = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'

  // Direct UPI Payment Modals & Flows
  const [selectedPlanForUpi, setSelectedPlanForUpi] = useState(null);
  const [upiPaymentData, setUpiPaymentData] = useState(null);
  const [initiatingPayment, setInitiatingPayment] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');
  const [verificationStatus, setVerificationStatus] = useState(null); // 'pending' | 'verified' | 'failed'
  const [cancellingAutoRenew, setCancellingAutoRenew] = useState(false);
  const [activeTab, setActiveTab] = useState('plans'); // 'plans' | 'history'
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  const businessId = user?.business_id || user?.id;

  // Fetch subscription, plans, and payment history
  const loadData = async (isRetry = false) => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    if (isRetry) {
      setRetrying(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const [fetchedPlans, subData, historyData] = await Promise.all([
        subscriptionService.getPlans().catch(() => []),
        subscriptionService.getSubscription(businessId).catch(() => null),
        subscriptionService.getPaymentHistory(businessId).catch(() => []),
      ]);

      if (subData?.errorType) {
        setLoadError({
          type: subData.errorType,
          message: subData.error,
        });
        setSubscription({
          plan: 'FREE',
          status: 'ACTIVE',
          amount: 0,
          billing_interval: 'monthly',
          auto_renew: false,
          is_free: true,
          can_access_premium: false,
        });
      } else {
        setSubscription(subData || {
          plan: 'FREE',
          status: 'ACTIVE',
          amount: 0,
          billing_interval: 'monthly',
          auto_renew: false,
          is_free: true,
          can_access_premium: false,
        });
      }

      setPlans(Array.isArray(fetchedPlans) ? fetchedPlans : []);
      setPaymentHistory(Array.isArray(historyData) ? historyData : []);
    } catch (err) {
      console.error('[SUBSCRIPTION] Data load error:', err);
      setLoadError({
        type: 'NETWORK_ERROR',
        message: 'Unable to reach server. Please check your internet connection.',
      });
      setSubscription({
        plan: 'FREE',
        status: 'ACTIVE',
        amount: 0,
        billing_interval: 'monthly',
        auto_renew: false,
        is_free: true,
        can_access_premium: false,
      });
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [businessId]);

  const safePlans = Array.isArray(plans) ? plans : [];
  const safeHistory = Array.isArray(paymentHistory) ? paymentHistory : [];

  const currentPlanId = (subscription?.plan || 'FREE').toUpperCase();
  const currentPlan =
    safePlans.find((p) => (p.id || '').toUpperCase() === currentPlanId) || {
      id: currentPlanId,
      name: currentPlanId === 'FREE' ? 'Free' : currentPlanId,
      price: subscription?.amount || 0,
      customerLimit: 50,
      staffLimit: 1,
      features: ['Basic Store Management', 'Digital QR Menu'],
    };

  const isFreePlan = currentPlanId === 'FREE';
  const isActive = subscription?.status === 'ACTIVE';
  const autoRenewOn = subscription?.auto_renew === true;
  const isCancelledAtPeriodEnd = subscription?.cancel_at_period_end === true;

  // Format Next Billing / Expiration Date
  let nextBillingDate = null;
  const rawDate = subscription?.next_billing_date || subscription?.expires_at || subscription?.current_period_end;
  if (rawDate) {
    try {
      nextBillingDate = new Date(rawDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch (_) {
      nextBillingDate = null;
    }
  }

  // Step 1: User selects a plan to upgrade / pay
  const handleSelectPlan = (plan) => {
    if (plan.id === 'FREE') {
      handleSwitchToFree();
      return;
    }
    const planAmount = billingCycle === 'annual' ? (plan.annualPrice || plan.price * 10) : plan.price;
    const directUri = `upi://pay?pa=8521893325@ybl&pn=ZOOR%20UP&am=${planAmount}&cu=INR&tn=${encodeURIComponent('ZOOR UP - ' + plan.name)}`;

    setSelectedPlanForUpi(plan);
    setVerificationStatus(null);
    setUtrNumber('');
    setUpiPaymentData({
      payment_id: `pay_upi_${Date.now()}`,
      upi_uri: directUri,
      amount: planAmount,
      plan_name: plan.name,
      plan_id: plan.id.toLowerCase(),
    });

    // Auto-initiate backend pending payment in background
    subscriptionService.initiateUpiPayment(businessId, plan.id, billingCycle).then((res) => {
      if (res && res.success) {
        setUpiPaymentData(res);
      }
    }).catch(() => {});
  };

  const handleCopyUpi = () => {
    navigator.clipboard?.writeText('8521893325@ybl');
    setCopiedUpi(true);
    addToast('Merchant UPI ID copied: 8521893325@ybl', 'info');
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleCopyAmount = (amt) => {
    navigator.clipboard?.writeText(String(amt));
    setCopiedAmount(true);
    addToast(`Amount copied: ₹${amt}`, 'info');
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  // Step 2: Switch to Free plan
  const handleSwitchToFree = async () => {
    if (!window.confirm('Are you sure you want to switch to the Free plan? Premium features will be deactivated at the end of your billing cycle.')) {
      return;
    }
    setLoading(true);
    try {
      const res = await subscriptionService.initiateUpiPayment(businessId, 'FREE');
      if (res.success) {
        addToast('Switched to Free plan. No payment required.', 'success');
        await loadData();
      } else {
        addToast(res.error || 'Failed to switch plan', 'error');
      }
    } catch (e) {
      addToast('Error switching plan', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Initiate Direct UPI Payment
  const handleInitiateUpiPayment = async () => {
    if (!selectedPlanForUpi) return;
    setInitiatingPayment(true);
    try {
      const res = await subscriptionService.initiateUpiPayment(
        businessId,
        selectedPlanForUpi.id,
        billingCycle
      );

      if (res && res.success) {
        setUpiPaymentData(res);
      }
      setVerificationStatus('pending');

      // Attempt to launch user's installed UPI app via deep link
      if (res?.upi_uri) {
        try {
          window.location.href = res.upi_uri;
        } catch (_) {}
      }
    } catch (err) {
      console.error('[UPI INITIATE ERROR]', err);
    } finally {
      setInitiatingPayment(false);
    }
  };

  const handleVerifyUpiPayment = async () => {
    const paymentId = upiPaymentData?.payment_id || `pay_${Date.now()}`;
    const cleanUtr = utrNumber.trim();
    if (!cleanUtr) {
      const proceedWithoutUtr = window.confirm(
        'You have not entered a 12-digit UPI Reference / UTR Number. Have you already completed the payment in your UPI app?'
      );
      if (!proceedWithoutUtr) return;
    }

    setVerifyingPayment(true);
    try {
      const res = await subscriptionService.verifyPayment(paymentId, {
        utr: cleanUtr || undefined,
        transaction_reference: cleanUtr || undefined,
        plan_id: selectedPlanForUpi?.id,
        billing_interval: billingCycle,
        business_id: businessId,
        status: 'paid',
      });

      if (res.success && (res.verified || res.status === 'paid')) {
        setVerificationStatus('verified');
        try {
          confetti({
            particleCount: 120,
            spread: 90,
            origin: { y: 0.5 },
          });
        } catch (_) {}
        addToast(`🎉 Payment verified! Welcome to ${selectedPlanForUpi.name} plan!`, 'success');
        setTimeout(async () => {
          setSelectedPlanForUpi(null);
          setUpiPaymentData(null);
          setVerificationStatus(null);
          await loadData();
        }, 1500);
      } else {
        setVerificationStatus('pending');
        addToast(res.message || 'Payment verification pending. If already paid, please submit your 12-digit UTR number.', 'info');
      }
    } catch (err) {
      console.error('[UPI VERIFY ERROR]', err);
      addToast(err.message || 'Payment verification failed', 'error');
    } finally {
      setVerifyingPayment(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!upiPaymentData?.payment_id) return;
    setVerifyingPayment(true);
    try {
      const statusRes = await subscriptionService.getPaymentStatus(upiPaymentData.payment_id);
      if (statusRes?.status === 'paid') {
        setVerificationStatus('verified');
        addToast(`🎉 Payment verified! Welcome to ${selectedPlanForUpi.name} plan!`, 'success');
        setTimeout(async () => {
          setSelectedPlanForUpi(null);
          setUpiPaymentData(null);
          await loadData();
        }, 1500);
      } else if (statusRes?.status === 'failed') {
        setVerificationStatus('failed');
        addToast('Payment failed. Please try again.', 'error');
      } else {
        setVerificationStatus('pending');
        addToast('Payment initiated. Verification is pending.', 'info');
      }
    } catch (err) {
      addToast('Payment verification pending. Please check again in a few moments.', 'info');
    } finally {
      setVerifyingPayment(false);
    }
  };

  // Step 5: Cancel Auto-Renewal
  const handleCancelAutoRenew = async () => {
    if (!window.confirm('Cancel subscription? Your plan will remain active until the end of your billing period.')) {
      return;
    }
    setCancellingAutoRenew(true);
    try {
      const res = await subscriptionService.cancelAutoRenew(businessId, subscription?.subscription_id);
      if (res.success) {
        addToast('Subscription cancellation scheduled. Access remains active until period ends.', 'success');
        await loadData();
      } else {
        addToast(res.error || 'Failed to cancel subscription', 'error');
      }
    } catch (e) {
      addToast('Error cancelling subscription', 'error');
    } finally {
      setCancellingAutoRenew(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <ZoorUpLogo size="md" priority />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Subscription & Billing</h1>
              <Badge variant="primary" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Direct UPI</Badge>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
              Merchant subscription plans, direct UPI billing, and payment history.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', padding: '0.25rem', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('plans')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === 'plans' ? '#1A2B49' : 'transparent',
              color: activeTab === 'plans' ? '#FFFFFF' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <Sparkles size={15} /> Plans & Tiers
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === 'history' ? '#1A2B49' : 'transparent',
              color: activeTab === 'history' ? '#FFFFFF' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <History size={15} /> Payment History ({safeHistory.length})
          </button>
        </div>
      </div>

      {/* Granular Error Banner with Retry Button */}
      {loadError && (
        <div
          style={{
            padding: '1rem 1.25rem',
            background:
              loadError.type === 'UNAUTHORIZED'
                ? 'rgba(239, 68, 68, 0.08)'
                : loadError.type === 'NETWORK_ERROR'
                ? 'rgba(245, 158, 11, 0.08)'
                : 'rgba(239, 68, 68, 0.08)',
            borderRadius: 'var(--radius-md)',
            border:
              loadError.type === 'NETWORK_ERROR'
                ? '1px solid rgba(245, 158, 11, 0.3)'
                : '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {loadError.type === 'NETWORK_ERROR' ? (
              <WifiOff size={22} color="#D97706" />
            ) : loadError.type === 'UNAUTHORIZED' ? (
              <Lock size={22} color="#DC2626" />
            ) : (
              <AlertCircle size={22} color="#DC2626" />
            )}
            <div>
              <strong
                style={{
                  fontSize: '0.9rem',
                  color: loadError.type === 'NETWORK_ERROR' ? '#B45309' : '#B91C1C',
                  display: 'block',
                }}
              >
                {loadError.type === 'NETWORK_ERROR'
                  ? 'Unable to reach server. Please check your internet connection.'
                  : loadError.type === 'UNAUTHORIZED'
                  ? 'Session expired. Please log in again.'
                  : loadError.type === 'FORBIDDEN'
                  ? "You don't have permission to manage subscriptions."
                  : 'Server error while loading subscription. Please try again later.'}
              </strong>
              {loadError.message && loadError.message !== loadError.type && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {loadError.message}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {loadError.type === 'UNAUTHORIZED' ? (
              <Button
                variant="primary"
                size="sm"
                icon={LogIn}
                onClick={() => navigate('/login')}
              >
                Log In Again
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                icon={RefreshCw}
                loading={retrying}
                onClick={() => loadData(true)}
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {/* SECTION 15: CURRENT SUBSCRIPTION SUMMARY CARD */}
      <Card style={{ padding: '1.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              Current Subscription
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem' }}>
              <h2 style={{ fontSize: '1.85rem', fontWeight: 900, margin: 0 }}>
                {currentPlan.name} Plan
              </h2>
              <Badge
                variant={isFreePlan ? 'secondary' : isActive ? 'success' : 'warning'}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
              >
                {subscription?.status || 'ACTIVE'}
              </Badge>
              {!isFreePlan && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: '#10B981', fontWeight: 600 }}>
                  <CheckCircle2 size={13} /> Direct UPI Active
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.35rem 0 0 0' }}>
              {isFreePlan
                ? 'Free business registration tier. Standard tools with quota limits. Upgrade anytime for automated marketing, staff accounts, and unlimited loyalty.'
                : `Active direct UPI subscription under merchant brand ZOOR UP (UPI: 8521893325@ybl).`}
            </p>
          </div>

          {/* Pricing & Billing Details */}
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Billing Cycle</span>
              <strong style={{ fontSize: '1rem', textTransform: 'capitalize' }}>
                {isFreePlan ? 'No paid billing' : (subscription?.billing_interval || 'Monthly')}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Amount</span>
              <strong style={{ fontSize: '1.2rem', color: isFreePlan ? 'inherit' : '#1A2B49' }}>
                ₹{isFreePlan ? 0 : currentPlan.price}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/{subscription?.billing_interval === 'annual' ? 'yr' : 'mo'}</span>
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Payment</span>
              <strong style={{ fontSize: '1rem', color: isFreePlan ? '#10B981' : 'inherit' }}>
                {isFreePlan ? 'Not Required' : (subscription?.payment_status || 'PAID')}
              </strong>
            </div>

            {nextBillingDate && !isFreePlan && (
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>
                  Access Valid Until
                </span>
                <strong style={{ fontSize: '1rem' }}>
                  {nextBillingDate}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {isFreePlan ? (
              <Button
                variant="primary"
                onClick={() => {
                  setActiveTab('plans');
                  const growth = plans.find((p) => p.id === 'GROWTH') || plans[1];
                  if (growth) handleSelectPlan(growth);
                }}
                icon={Sparkles}
              >
                Upgrade to Paid Plan
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setActiveTab('plans')}
                >
                  Renew / Change Plan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSwitchToFree}
                >
                  Switch to Free
                </Button>
              </>
            )}
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={16} color="#10B981" />
            <span>Direct UPI Payment • 8521893325@ybl</span>
          </div>
        </div>
      </Card>

      {/* TAB 1: PLANS & TIERS */}
      {activeTab === 'plans' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Billing Cycle Toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: billingCycle === 'monthly' ? 700 : 500, color: billingCycle === 'monthly' ? 'inherit' : 'var(--text-secondary)' }}>
              Monthly Billing
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
            >
              {billingCycle === 'annual' ? (
                <ToggleRight size={36} color="#1A2B49" />
              ) : (
                <ToggleLeft size={36} color="#94A3B8" />
              )}
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: billingCycle === 'annual' ? 700 : 500, color: billingCycle === 'annual' ? 'inherit' : 'var(--text-secondary)' }}>
              Annual Billing
            </span>
            <Badge variant="success" style={{ fontSize: '0.7rem' }}>Save 17%</Badge>
          </div>

          {/* Plan Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            {safePlans.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              const isRecommended = plan.recommended || plan.id === 'GROWTH';
              const displayPrice = billingCycle === 'annual' ? (plan.annualPrice || plan.price * 10) : plan.price;

              return (
                <Card
                  key={plan.id}
                  style={{
                    padding: '1.5rem',
                    position: 'relative',
                    border: isRecommended ? '2px solid #1A2B49' : isCurrent ? '2px solid #10B981' : '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isRecommended ? '0 10px 25px -5px rgba(26, 43, 73, 0.12)' : 'none',
                  }}
                >
                  {isRecommended && (
                    <div style={{ position: 'absolute', top: '-12px', right: '1.25rem' }}>
                      <Badge variant="primary" style={{ fontWeight: 700, padding: '0.2rem 0.65rem' }}>
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  {isCurrent && (
                    <div style={{ position: 'absolute', top: '-12px', left: '1.25rem' }}>
                      <Badge variant="success" style={{ fontWeight: 700, padding: '0.2rem 0.65rem' }}>
                        Active Plan
                      </Badge>
                    </div>
                  )}

                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.5rem 0 0.25rem 0' }}>
                      {plan.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', margin: '0.75rem 0' }}>
                      <span style={{ fontSize: '1.75rem', fontWeight: 900 }}>₹{displayPrice}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        /{billingCycle === 'annual' ? 'year' : 'month'}
                      </span>
                    </div>

                    <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', marginBottom: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div>Max Customers: <strong>{plan.customerLimit?.toLocaleString()}</strong></div>
                      <div>Staff Accounts: <strong>{plan.staffLimit}</strong></div>
                    </div>

                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
                      {plan.features?.map((f, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <Check size={15} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ marginTop: '1.75rem' }}>
                    {isCurrent ? (
                      <Button variant="outline" block disabled style={{ opacity: 0.85 }}>
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        variant={isRecommended ? 'primary' : 'secondary'}
                        block
                        onClick={() => handleSelectPlan(plan)}
                      >
                        {plan.id === 'FREE' ? 'Switch to Free' : 'Pay with UPI'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PAYMENT HISTORY */}
      {activeTab === 'history' && (
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Payment History</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Real-time payment records
            </span>
          </div>

          {safeHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
              <FileText size={40} style={{ opacity: 0.4, margin: '0 auto 0.75rem auto' }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No payment records found yet.</p>
              <span style={{ fontSize: '0.78rem' }}>When your subscription payments are processed, records will appear here.</span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Plan</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Amount</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Payment ID</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Method</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Billing</th>
                  </tr>
                </thead>
                <tbody>
                  {safeHistory.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {p.date ? new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>
                        {p.plan}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>
                        ₹{p.amount}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <Badge variant={p.status === 'PAID' ? 'success' : 'danger'}>
                          {p.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {p.payment_id || p.id}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Smartphone size={13} /> {p.payment_method?.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textTransform: 'capitalize' }}>
                        {p.billing_interval || 'Monthly'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* DIRECT UPI PAYMENT MODAL */}
      <Modal
        isOpen={Boolean(selectedPlanForUpi)}
        onClose={() => {
          if (!initiatingPayment && !verifyingPayment) {
            setSelectedPlanForUpi(null);
            setUpiPaymentData(null);
            setVerificationStatus(null);
            setUtrNumber('');
          }
        }}
        title="Pay with UPI"
        maxWidth="540px"
      >
        {selectedPlanForUpi && (() => {
          const planAmount = billingCycle === 'annual'
            ? (selectedPlanForUpi.annualPrice || selectedPlanForUpi.price * 10)
            : selectedPlanForUpi.price;
          const currentUpiUri = upiPaymentData?.upi_uri || `upi://pay?pa=8521893325@ybl&pn=ZOOR%20UP&am=${planAmount}&cu=INR&tn=${encodeURIComponent('ZOOR UP - ' + selectedPlanForUpi.name)}`;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Status Banner (if verified or failed) */}
              {verificationStatus === 'verified' && (
                <div style={{
                  padding: '1rem',
                  background: 'rgba(16, 185, 129, 0.12)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  color: '#065F46'
                }}>
                  <CheckCircle2 size={24} color="#10B981" style={{ flexShrink: 0 }} />
                  <div>
                    <strong style={{ fontSize: '0.95rem' }}>Payment Verified Successfully!</strong>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: '#047857' }}>
                      Your <strong>{selectedPlanForUpi.name}</strong> subscription is now active. Enjoy all premium benefits!
                    </p>
                  </div>
                </div>
              )}

              {verificationStatus === 'failed' && (
                <div style={{
                  padding: '0.85rem 1rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  color: '#991B1B'
                }}>
                  <XCircle size={20} color="#EF4444" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Payment verification failed. Please check your UTR number or retry.</span>
                </div>
              )}

              {/* Plan & Amount Summary Card */}
              <div style={{
                padding: '1rem 1.25rem',
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.06) 0%, rgba(59, 130, 246, 0.12) 100%)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <Badge variant="primary">{selectedPlanForUpi.name} Plan</Badge>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                      ({billingCycle} Billing)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Payee: <strong style={{ color: 'var(--text-primary)' }}>ZOOR UP</strong>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Total Payable
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--primary-color, #2563EB)', lineHeight: 1.1 }}>
                    ₹{planAmount}
                  </div>
                </div>
              </div>

              {/* Scannable High-Contrast QR Code Card */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.25rem',
                background: '#FFFFFF',
                borderRadius: 'var(--radius-lg, 14px)',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
                margin: '0 auto',
                width: '100%',
                maxWidth: '300px'
              }}>
                <div style={{
                  padding: '10px',
                  background: '#FFFFFF',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <QRCodeSVG
                    value={currentUpiUri}
                    size={180}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div style={{
                  marginTop: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  color: '#1E293B',
                  fontSize: '0.82rem',
                  fontWeight: 700
                }}>
                  <QrCode size={16} color="#2563EB" />
                  <span>Scan with any UPI App</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.2rem', textAlign: 'center' }}>
                  Google Pay • PhonePe • Paytm • BHIM • CRED
                </span>
              </div>

              {/* Mobile Action & Quick Copy Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Direct UPI App Link for Mobile */}
                <a
                  href={currentUpiUri}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.85rem 1rem',
                    background: 'var(--primary-color, #2563EB)',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    textDecoration: 'none',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Smartphone size={18} />
                  <span>Pay ₹{planAmount} with UPI</span>
                  <ExternalLink size={15} />
                </a>

                {/* Copy Buttons Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyUpi}
                    icon={copiedUpi ? Check : Copy}
                  >
                    {copiedUpi ? 'Copied ID!' : 'Copy UPI ID'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyAmount(planAmount)}
                    icon={copiedAmount ? Check : Copy}
                  >
                    {copiedAmount ? 'Copied Amount!' : `Copy ₹${planAmount}`}
                  </Button>
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Merchant UPI ID: <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>8521893325@ybl</strong>
                </div>
              </div>

              {/* Verification & 12-digit UTR Input */}
              {verificationStatus !== 'verified' && (
                <div style={{
                  padding: '1rem',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ShieldCheck size={16} color="#10B981" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      Step 2: Enter 12-Digit UPI Ref / UTR
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    After completing payment in your UPI app, enter the 12-digit UTR / Reference number from the receipt to activate your plan:
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="e.g. 426812345678"
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value.replace(/\s+/g, ''))}
                      maxLength={20}
                      style={{
                        flex: '1 1 180px',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace'
                      }}
                    />
                    <Button
                      variant="primary"
                      loading={verifyingPayment}
                      onClick={handleVerifyUpiPayment}
                      icon={Zap}
                      style={{ flex: '0 0 auto' }}
                    >
                      Verify & Activate Plan
                    </Button>
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <Button
                  variant="secondary"
                  disabled={verifyingPayment}
                  onClick={() => {
                    setSelectedPlanForUpi(null);
                    setUpiPaymentData(null);
                    setVerificationStatus(null);
                  }}
                >
                  {verificationStatus === 'verified' ? 'Done' : 'Close'}
                </Button>
                {verificationStatus !== 'verified' && (
                  <Button
                    variant="outline"
                    loading={verifyingPayment}
                    onClick={handleCheckStatus}
                    icon={RefreshCw}
                  >
                    Check Status
                  </Button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};
