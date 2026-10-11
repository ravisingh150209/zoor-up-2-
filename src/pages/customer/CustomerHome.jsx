import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  QrCode,
  Award,
  ShoppingBag,
  Store,
  ChevronRight,
  TrendingUp,
  Tag,
  ArrowRight,
  Clock,
  Compass,
  Gift,
  CheckCircle2,
  ExternalLink,
  X,
  CreditCard,
  RefreshCw,
  Copy,
  Check,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { loyaltyService } from '../../services/loyaltyService';
import { customerService } from '../../services/customerService';
import { notificationService } from '../../services/notificationService';
import { getErrorMessage } from '../../utils/errorUtils';
import { LoyaltyCard3D } from '../../components/customer/LoyaltyCard3D';
import { LevelProgressTracker } from '../../components/customer/LevelProgressTracker';
import { LevelUpModal } from '../../components/customer/LevelUpModal';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const CustomerHome = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Core State
  const [profile, setProfile] = useState(null);
  const [loyaltyStatus, setLoyaltyStatus] = useState(null);
  const [levelUpModalData, setLevelUpModalData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [offers, setOffers] = useState([]);
  const [visits, setVisits] = useState([]);
  const [claimedRewards, setClaimedRewards] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [businessScopeError, setBusinessScopeError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active UI Tabs / Modals
  const [rewardsTab, setRewardsTab] = useState('AVAILABLE'); // 'AVAILABLE' | 'CLAIMED'
  const [selectedRewardForClaim, setSelectedRewardForClaim] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const [businessLoading, setBusinessLoading] = useState(false);

  // Check-in Celebration State
  const [celebrationData, setCelebrationData] = useState(null);
  const celebratedRef = useRef(false);
  const inFlightRef = useRef(false);

  const customerId = profile?.customer_id || user?.customer_id;
  const customerName = profile?.name || user?.name || 'Customer';
  const customerPoints = selectedBusinessId && loyaltyStatus ? Number(loyaltyStatus.points ?? 0) : Number(profile?.points ?? user?.points ?? 0);
  const customerStamps = selectedBusinessId && loyaltyStatus ? Number(loyaltyStatus.stamps ?? 0) : Number(profile?.stamps ?? user?.stamps ?? 0);
  const totalVisits = Number(profile?.total_visits ?? profile?.visits ?? visits.length ?? 0);
  const lifetimePoints = Number(profile?.lifetime_points ?? customerPoints);
  const isNewCustomer = customerPoints === 0 && customerStamps === 0 && visits.length === 0;

  // Real authoritative loyalty level calculation from backend status or configured tiers
  const levelInfo = loyaltyService.getLevelInfo(customerPoints, loyaltyStatus?.tiers);
  if (loyaltyStatus?.level) {
    levelInfo.currentLevel = loyaltyStatus.level;
    if (loyaltyStatus.level_name) {
      levelInfo.currentTier.name = loyaltyStatus.level_name;
    }
  }

  useEffect(() => {
    loadAllDashboardData();
  }, [user]);

  // Handle incoming celebration from scanner navigation
  useEffect(() => {
    if (location.state?.freshCheckin && !celebratedRef.current) {
      celebratedRef.current = true;
      const chk = location.state.freshCheckin;
      if (!chk.alreadyCheckedInToday) {
        setCelebrationData(chk);
        try {
          confetti({
            particleCount: 110,
            spread: 90,
            origin: { y: 0.5 },
          });
        } catch (e) {}
      }
      if (chk.levelUp) {
        const storageKey = `zoorup_last_seen_level_${customerId}`;
        setLevelUpModalData({
          from_level: chk.levelUp.from_level || (chk.levelUp.to_level - 1),
          to_level: chk.levelUp.to_level,
          from_name: chk.levelUp.from || `LEVEL ${chk.levelUp.from_level || 1}`,
          to_name: chk.levelUp.to || `LEVEL ${chk.levelUp.to_level}`,
          perk: chk.levelUp.perk,
        });
        localStorage.setItem(storageKey, (chk.levelUp.to_level || 1).toString());
      }
      // Clear location state history so it doesn't replay on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state, customerId]);

  // Switch business and load its loyalty/rewards/offers
  const switchBusiness = async (newBizId) => {
    if (!newBizId) return;
    setSelectedBusinessId(newBizId);
    setBusinessScopeError(null);
    setBusinessLoading(true);
    try {
      const results = await Promise.allSettled([
        loyaltyService.getBusinessLoyalty(newBizId),
        loyaltyService.getRewards(newBizId),
        loyaltyService.getOffers(newBizId),
      ]);

      const loyaltyResult = results[0];
      if (loyaltyResult.status === 'fulfilled') {
        setLoyaltyStatus(loyaltyResult.value);
      } else {
        console.warn('Failed to load business loyalty:', loyaltyResult.reason);
        setLoyaltyStatus(null);
        setBusinessScopeError(getErrorMessage(loyaltyResult.reason, 'Unable to load loyalty data.'));
      }

      const rewardsResult = results[1];
      if (rewardsResult.status === 'fulfilled') {
        setRewards(rewardsResult.value || []);
      } else {
        console.warn('Failed to load rewards:', rewardsResult.reason);
        setRewards([]);
      }

      const offersResult = results[2];
      if (offersResult.status === 'fulfilled') {
        setOffers(Array.isArray(offersResult.value) ? offersResult.value.filter((o) => o.active) : []);
      } else {
        console.warn('Failed to load offers:', offersResult.reason);
        setOffers([]);
      }
    } catch (err) {
      setBusinessScopeError(getErrorMessage(err, 'Unable to load loyalty data.'));
      setLoyaltyStatus(null);
      setRewards([]);
      setOffers([]);
    } finally {
      setBusinessLoading(false);
    }
  };

  // Rule of Hooks compliance: All hooks MUST be declared unconditionally before any returns
  useEffect(() => {
    if (businesses.length > 0 && !selectedBusinessId) {
      switchBusiness(businesses[0].id);
    }
  }, [businesses, selectedBusinessId]);

  const loadAllDashboardData = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    setBusinessScopeError(null);
    try {
      const homeData = await customerService.getCustomerHome();

      if (homeData && homeData.success) {
        const cProfile = homeData.customer;
        const seenBizIds = new Set();
        const connBiz = (homeData.businesses || []).filter(b => {
          if (!b?.id || seenBizIds.has(b.id)) return false;
          seenBizIds.add(b.id);
          return true;
        });
        setProfile(cProfile);
        setBusinesses(connBiz);
        setOrders(homeData.orders || []);
        setVisits(homeData.visits || []);

        if (connBiz.length === 0) {
          setSelectedBusinessId(null);
          setLoyaltyStatus(null);
          setRewards([]);
          setClaimedRewards([]);
          setOffers([]);
          notificationService.runReminderEngine(user).catch(() => {});
          return;
        }

        const nextSelectedBusinessId = selectedBusinessId && connBiz.some((b) => b.id === selectedBusinessId)
          ? selectedBusinessId
          : connBiz[0].id;

        setSelectedBusinessId(nextSelectedBusinessId);

        // Parallelize: loyalty status + rewards + claimed rewards + offers
        // Use Promise.allSettled for resilience - non-critical failures won't block the page
        if (nextSelectedBusinessId) {
          const results = await Promise.allSettled([
            loyaltyService.getBusinessLoyalty(nextSelectedBusinessId),
            loyaltyService.getRewards(nextSelectedBusinessId),
            loyaltyService.getClaimedRewards(cProfile?.customer_id || customerId),
            loyaltyService.getOffers(nextSelectedBusinessId),
          ]);

          // Handle each result individually
          const businessLoyaltyResult = results[0];
          if (businessLoyaltyResult.status === 'fulfilled') {
            setLoyaltyStatus(businessLoyaltyResult.value);
          } else {
            console.warn('Failed to load business loyalty:', businessLoyaltyResult.reason);
            setLoyaltyStatus(null);
            setBusinessScopeError(getErrorMessage(businessLoyaltyResult.reason, 'Loyalty data temporarily unavailable'));
          }

          const rewardsResult = results[1];
          if (rewardsResult.status === 'fulfilled') {
            setRewards(rewardsResult.value || []);
          } else {
            console.warn('Failed to load rewards:', rewardsResult.reason);
            setRewards([]);
          }

          const claimedRewardsResult = results[2];
          if (claimedRewardsResult.status === 'fulfilled') {
            setClaimedRewards(claimedRewardsResult.value || []);
          } else {
            console.warn('Failed to load claimed rewards:', claimedRewardsResult.reason);
            setClaimedRewards([]);
          }

          const offersResult = results[3];
          if (offersResult.status === 'fulfilled') {
            setOffers(Array.isArray(offersResult.value) ? offersResult.value.filter((o) => o.active) : []);
          } else {
            console.warn('Failed to load offers:', offersResult.reason);
            setOffers([]);
          }
        } else {
          setLoyaltyStatus(null);
          setBusinessScopeError('No business selected. Choose a connected business to view loyalty.');
          setRewards([]);
          setClaimedRewards([]);
          setOffers([]);
        }

        notificationService.runReminderEngine(user).catch(() => {});
        return;
      }

      throw new Error('Unable to load your connected businesses.');
    } catch (err) {
      console.error('Error loading customer dashboard data:', err);
      setError(getErrorMessage(err, 'Unable to load your loyalty card.'));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  // Claim Reward Execution
  const handleConfirmClaimReward = async () => {
    if (!selectedRewardForClaim) return;
    setClaiming(true);
    try {
      const targetBizId = selectedRewardForClaim.business_id || selectedBusinessId || (businesses.length > 0 ? businesses[0].id : null);
      const res = await loyaltyService.claimReward(customerId, selectedRewardForClaim.id, targetBizId);
      const voucherCode = res.voucher_code || res.claim?.code || res.claim?.voucher_code;
      addToast(`🎉 Reward "${selectedRewardForClaim.title}" unlocked! Voucher: ${voucherCode}`, 'success');
      setSelectedRewardForClaim(null);

      // Trigger reward confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {}

      // Refresh only affected data: claimed rewards, rewards, and profile (points)
      // Use Promise.allSettled for resilience
      const refreshResults = await Promise.allSettled([
        loyaltyService.getClaimedRewards(customerId),
        loyaltyService.getRewards(targetBizId),
      ]);

      const claimedResult = refreshResults[0];
      if (claimedResult.status === 'fulfilled') {
        setClaimedRewards(claimedResult.value || []);
      } else {
        console.warn('Failed to refresh claimed rewards:', claimedResult.reason);
      }

      const rewardsResult = refreshResults[1];
      if (rewardsResult.status === 'fulfilled') {
        setRewards(rewardsResult.value || []);
      } else {
        console.warn('Failed to refresh rewards:', rewardsResult.reason);
      }

      // Refresh profile to get updated points
      try {
        const freshProfile = await customerService.getProfile(user);
        if (freshProfile) setProfile(freshProfile);
      } catch (profileErr) {
        console.warn('Failed to refresh profile:', profileErr);
      }
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not claim reward'), 'error');
    } finally {
      setClaiming(false);
    }
  };

  const handleCopyVoucher = (code) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    addToast(`Voucher code "${code}" copied to clipboard!`, 'info');
    setTimeout(() => setCopiedCode(null), 3000);
  };

  // Stamp progress calculations
  const totalStampsRequired = 10;
  const currentStampsCycle = customerStamps % totalStampsRequired;
  const stampsRemaining = totalStampsRequired - currentStampsCycle;
  const isRewardUnlockedByStamps = customerStamps > 0 && customerStamps >= totalStampsRequired;

  // Render Skeleton Loading State (Section 18: No fake numbers, premium skeleton card)
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '920px', margin: '0 auto', width: '100%', padding: '0 0.25rem 2rem' }}>
        {/* Skeleton Greeting */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ width: '220px', height: '28px', background: '#E2E8F0', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '160px', height: '16px', background: '#F1F5F9', borderRadius: '6px', marginTop: '8px', animation: 'pulse 1.5s infinite' }} />
          </div>
          <div style={{ width: '110px', height: '32px', background: '#E2E8F0', borderRadius: '999px', animation: 'pulse 1.5s infinite' }} />
        </div>

        {/* Skeleton 3D Dynamic Card */}
        <LoyaltyCard3D loading={true} />

        {/* Skeleton Level Progress */}
        <div style={{ height: '90px', background: '#FFFFFF', borderRadius: '18px', border: '1px solid #E2E8F0', animation: 'pulse 1.5s infinite' }} />

        {/* Skeleton Summary Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: '80px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      </div>
    );
  }

  // Render Friendly Error State (Section 19: "Unable to load your loyalty card." with [Retry])
  if (error) {
    return (
      <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#FEE2E2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            boxShadow: '0 8px 20px rgba(220, 38, 38, 0.15)',
          }}
        >
          <AlertCircle size={32} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.5rem' }}>
          Unable to load your loyalty card.
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '1.5rem' }}>
          {error}
        </p>
        <Button
          variant="primary"
          onClick={loadAllDashboardData}
          icon={RefreshCw}
          style={{ background: '#1A2B49', color: '#FFFFFF', fontWeight: 700 }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const hasBusinessSelection = businesses.length > 0 && selectedBusinessId;
  if (businesses.length === 0) {
    return (
      <div style={{ maxWidth: '660px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem 1rem' }}>
        <div className="card" style={{ padding: '1.5rem', borderRadius: '18px', background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: '0 0 0.5rem' }}>No store connected yet</h3>
          <p style={{ margin: 0, color: '#64748B' }}>
            Scan a ZOOR UP QR code at a store to connect and start earning rewards.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => navigate('/customer/scan-qr')}
          icon={QrCode}
          style={{ background: '#1A2B49', color: '#FFFFFF', fontWeight: 700 }}
        >
          Scan Store QR to Connect
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '920px', margin: '0 auto', width: '100%', padding: '0 0.25rem 2rem' }}>
      {/* =================================================================
          1. TOP GREETING (SECTION 15, ITEM 1)
          ================================================================= */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1A2B49', margin: 0, letterSpacing: '-0.02em' }}>
            {isNewCustomer ? `Start your loyalty journey, ${customerName} 👋` : `Welcome back, ${customerName} 👋`}
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#64748B', marginTop: '4px', margin: 0, fontWeight: 500 }}>
            {isNewCustomer
              ? 'Scan a participating business QR to earn your first reward.'
              : `Level ${levelInfo.currentLevel} • ${levelInfo.currentTier.name} Member`}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <Badge
            style={{
              background: '#1A2B49',
              color: '#FFFFFF',
              border: '1.5px solid #243B5F',
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              boxShadow: '0 2px 8px rgba(26, 43, 73, 0.15)',
            }}
          >
            LEVEL {levelInfo.currentLevel} • {levelInfo.currentTier.name}
          </Badge>
        </div>
      </div>

      {/* Store Switcher - Multi-Store Support */}
      {businesses.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.75rem 1rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>
            🏪 Active Store:
          </span>
          <select
            value={selectedBusinessId || ''}
            onChange={(e) => {
              const newBizId = e.target.value;
              if (newBizId) {
                switchBusiness(newBizId);
              } else {
                setSelectedBusinessId('');
                setBusinessScopeError('No business selected. Choose a connected business to view loyalty.');
                setLoyaltyStatus(null);
                setRewards([]);
                setOffers([]);
              }
            }}
            style={{
              flex: 1,
              minWidth: '200px',
              maxWidth: '320px',
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              border: '1.5px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#1A2B49',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.75rem center',
              paddingRight: '2.5rem',
            }}
          >
            {businesses.map((biz) => (
              <option key={biz.id} value={biz.id}>
                {biz.name} {biz.id === businesses[0].id ? '(Primary)' : ''}
              </option>
            ))}
          </select>
          {businesses.length > 1 && (
            <span style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 600 }}>
              {businesses.length} stores joined
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/customer/scan-qr')}
            icon={QrCode}
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
          >
            + Add Store
          </Button>
        </div>
      )}

      {/* =================================================================
          2. 3D DYNAMIC LOYALTY CARD (SECTION 15, ITEM 2)
          ================================================================= */}
      <div>
        <LoyaltyCard3D
          customerName={customerName}
          customerId={customerId}
          points={customerPoints}
          stamps={customerStamps}
          maxStamps={10}
          levelInfo={levelInfo}
          totalVisits={totalVisits}
          lifetimePoints={lifetimePoints}
          joinedDate={profile?.created_at ? new Date(profile.created_at).getFullYear().toString() : '2026'}
          loading={businessLoading}
        />
      </div>

      {/* =================================================================
          3. LEVEL PROGRESS TRACKER (SECTION 15, ITEM 3)
          ================================================================= */}
      <LevelProgressTracker levelInfo={levelInfo} totalPoints={customerPoints} />

      {/* =================================================================
          4. POINTS / VISITS / REWARDS SUMMARY (SECTION 15, ITEM 4)
          ================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
        {/* Metric 1: Available Points */}
        <div
          className="card card-hover"
          style={{
            background: '#FFFFFF',
            border: '1.5px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Available Points
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', lineHeight: 1.1 }}>
            {customerPoints.toLocaleString()}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Lifetime: {lifetimePoints.toLocaleString()} pts
          </span>
        </div>

        {/* Metric 2: VIP Membership Tier */}
        <div
          className="card card-hover"
          style={{
            background: '#FFFFFF',
            border: '1.5px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              VIP Membership
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Award size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', lineHeight: 1.1 }}>
            {levelInfo.currentTier.name}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Level {levelInfo.currentLevel} of 5
          </span>
        </div>

        {/* Metric 3: Stamp Progress */}
        <div
          className="card card-hover"
          style={{
            background: '#FFFFFF',
            border: '1.5px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Stamp Card
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', lineHeight: 1.1 }}>
            {currentStampsCycle} / {totalStampsRequired}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: i < currentStampsCycle ? '#F59E0B' : '#E2E8F0',
                  display: 'inline-block'
                }}
              />
            ))}
          </div>
        </div>

        {/* Metric 4: Rewards */}
        <div
          className="card card-hover"
          style={{
            background: '#FFFFFF',
            border: '1.5px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Store Rewards
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#F3E8FF', color: '#9333EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gift size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', lineHeight: 1.1 }}>
            {rewards.length} Available
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
            {claimedRewards.length} Active Vouchers
          </span>
        </div>
      </div>

      {/* Stamp Completion Banner (Section 10) */}
      {isRewardUnlockedByStamps && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
            border: '1.5px solid #10B981',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.15)',
          }}
        >
          <div>
            <strong style={{ fontSize: '1rem', color: '#065F46', display: 'block' }}>
              REWARD UNLOCKED 🎁
            </strong>
            <span style={{ fontSize: '0.85rem', color: '#047857' }}>
              You've earned 10 visits! Claim your complimentary reward voucher.
            </span>
          </div>
          <a
            href="#rewards-section"
            className="btn btn-primary"
            style={{ background: '#059669', color: '#FFFFFF', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none', borderRadius: '10px' }}
          >
            Claim Reward →
          </a>
        </div>
      )}

      {/* =================================================================
          4. QUICK ACTIONS GRID (SECTIONS 11 & 12)
          ================================================================= */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          {/* PRIMARY: Scan QR Button */}
          <Link
            to="/customer/scan-qr"
            className="card card-hover"
            style={{
              gridColumn: 'span 2',
              background: 'linear-gradient(135deg, #1A2B49 0%, #0F172A 100%)',
              border: '2px solid #F59E0B',
              borderRadius: '16px',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              textDecoration: 'none',
              color: '#FFFFFF',
              boxShadow: '0 6px 20px rgba(245, 158, 11, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  color: '#1A2B49',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 10px rgba(245, 158, 11, 0.4)',
                }}
              >
                <QrCode size={26} />
              </div>
              <div>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, display: 'block', lineHeight: 1.2 }}>
                  SCAN QR CODE
                </span>
                <span style={{ fontSize: '0.78rem', color: '#FEF3C7', marginTop: '2px', display: 'block' }}>
                  Auto stamp & points check-in
                </span>
              </div>
            </div>
            <ChevronRight size={22} style={{ color: '#F59E0B' }} />
          </Link>

          {/* Pay via UPI */}
          <button
            type="button"
            onClick={() => handleOpenUpiModal()}
            className="card card-hover"
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              borderRadius: '16px',
              padding: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              color: '#1A2B49',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#ECFDF5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Smartphone size={22} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Pay via UPI</span>
            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Direct VPA</span>
          </button>

          {/* Redeem Rewards */}
          <a
            href="#rewards-section"
            className="card card-hover"
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              borderRadius: '16px',
              padding: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '0.4rem',
              textDecoration: 'none',
              color: '#1A2B49',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Gift size={22} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Rewards</span>
            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{rewards.length} Available</span>
          </a>

          {/* Active Offers */}
          <a
            href="#offers-section"
            className="card card-hover"
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              borderRadius: '16px',
              padding: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '0.4rem',
              textDecoration: 'none',
              color: '#1A2B49',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Tag size={22} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Offers</span>
            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{offers.length} Deals</span>
          </a>

          {/* Recent Activity */}
          <a
            href="#activity-section"
            className="card card-hover"
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              borderRadius: '16px',
              padding: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '0.4rem',
              textDecoration: 'none',
              color: '#1A2B49',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#F1F5F9',
                color: '#1A2B49',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={22} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Activity</span>
            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{visits.length} Visits</span>
          </a>

          {/* Book a Table */}
          <Link
            to="/customer/table-booking"
            className="card card-hover"
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              borderRadius: '16px',
              padding: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '0.4rem',
              textDecoration: 'none',
              color: '#1A2B49',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Calendar size={22} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Book Table</span>
            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Reserve Online</span>
          </Link>

          {/* Discover Stores */}
          <Link
            to="/customer/businesses"
            className="card card-hover"
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              borderRadius: '16px',
              padding: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '0.4rem',
              textDecoration: 'none',
              color: '#1A2B49',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#F3E8FF',
                color: '#9333EA',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Compass size={22} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Stores</span>
            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Browse All</span>
          </Link>
        </div>
      </div>

      {/* =================================================================
          6. RECENT LOYALTY ACTIVITY (SECTION 15, ITEM 6)
          ================================================================= */}
      <div id="activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
              Recent Activity
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
              Your verified store visits, stamps earned, and check-in rewards
            </p>
          </div>
        </div>

        {visits.length === 0 && orders.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Your activity will appear here"
            description="Scan your first business QR code to earn stamps and record your visits."
          />
        ) : (
          <div
            className="card"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {visits.slice(0, 5).map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 0.5rem',
                    borderBottom: '1px solid #F1F5F9',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#FEF3C7',
                        color: '#92400E',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1A2B49' }}>
                        {v.notes || 'Store Check-in Verified'}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        {new Date(v.timestamp).toLocaleDateString()} at {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#D97706', display: 'block' }}>
                      +{v.points_awarded || 50} pts
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1A2B49' }}>
                      +{v.stamps_awarded || 1} stamp ☕
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =================================================================
          7. AVAILABLE REWARDS (SECTION 15, ITEM 7)
          ================================================================= */}
      <div id="rewards-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
              Loyalty Rewards Catalog
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
              Unlock vouchers and complimentary items using your points & stamps
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', background: '#F1F5F9', padding: '3px', borderRadius: '10px' }}>
            <button
              onClick={() => setRewardsTab('AVAILABLE')}
              style={{
                border: 'none',
                background: rewardsTab === 'AVAILABLE' ? '#FFFFFF' : 'transparent',
                color: rewardsTab === 'AVAILABLE' ? '#1A2B49' : '#64748B',
                fontWeight: 700,
                fontSize: '0.78rem',
                padding: '5px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: rewardsTab === 'AVAILABLE' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Available ({rewards.length})
            </button>
            <button
              onClick={() => setRewardsTab('CLAIMED')}
              style={{
                border: 'none',
                background: rewardsTab === 'CLAIMED' ? '#FFFFFF' : 'transparent',
                color: rewardsTab === 'CLAIMED' ? '#1A2B49' : '#64748B',
                fontWeight: 700,
                fontSize: '0.78rem',
                padding: '5px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: rewardsTab === 'CLAIMED' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              My Vouchers ({claimedRewards.length})
            </button>
          </div>
        </div>

        {rewardsTab === 'AVAILABLE' ? (
          rewards.length === 0 ? (
            <EmptyState
              icon={Gift}
              title="No rewards unlocked yet"
              description="Keep visiting your favorite businesses to earn stamps and unlock rewards."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {rewards.map((rew) => {
                const canClaim = customerPoints >= (rew.points || 0) || (rew.stamps && customerStamps >= rew.stamps);
                const progressPct = rew.points ? Math.min(100, Math.round((customerPoints / rew.points) * 100)) : 0;

                return (
                  <div
                    key={rew.id}
                    className="card card-hover"
                    style={{
                      background: '#FFFFFF',
                      border: '1.5px solid #E2E8F0',
                      borderRadius: '16px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <Badge style={{ background: '#FEF3C7', color: '#92400E', fontWeight: 700, fontSize: '0.72rem' }}>
                          {rew.category || 'Voucher'}
                        </Badge>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#D97706' }}>
                          {rew.points} pts {rew.stamps ? `or ${rew.stamps} stamps` : ''}
                        </span>
                      </div>

                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
                        {rew.title}
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '1rem' }}>
                        Worth ₹{rew.value || 100} off your next order.
                      </p>

                      {/* Points requirement progress */}
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>
                          <span>Points Progress</span>
                          <span>{customerPoints} / {rew.points}</span>
                        </div>
                        <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${progressPct}%`, height: '100%', background: '#F59E0B' }} />
                        </div>
                      </div>
                    </div>

                    <Button
                      variant={canClaim ? 'primary' : 'outline'}
                      size="sm"
                      fullWidth
                      disabled={!canClaim}
                      onClick={() => setSelectedRewardForClaim(rew)}
                      style={{
                        background: canClaim ? '#1A2B49' : 'transparent',
                        color: canClaim ? '#FFFFFF' : '#94A3B8',
                        borderColor: canClaim ? '#1A2B49' : '#CBD5E1',
                      }}
                    >
                      {canClaim ? 'Claim Reward' : `Need ${Math.max(0, rew.points - customerPoints)} more points`}
                    </Button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* My Claimed Vouchers List */
          claimedRewards.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No claimed vouchers yet"
              description="Claim available rewards above to generate redeemable voucher codes."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {claimedRewards.map((c) => (
                <div
                  key={c.id}
                  className="card"
                  style={{
                    background: '#FFFFFF',
                    border: '1.5px solid #10B981',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <Badge variant="success">ACTIVE VOUCHER</Badge>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      Exp: {c.expires_at}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.5rem' }}>
                    {c.reward_title}
                  </h4>

                  {/* Voucher Code Box */}
                  <div
                    style={{
                      background: '#F8FAFC',
                      border: '1.5px dashed #CBD5E1',
                      borderRadius: '10px',
                      padding: '0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '0.5rem',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 800, color: '#1A2B49' }}>
                      {c.voucher_code}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyVoucher(c.voucher_code)}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        color: copiedCode === c.voucher_code ? '#059669' : '#1A2B49',
                      }}
                    >
                      {copiedCode === c.voucher_code ? <Check size={14} /> : <Copy size={14} />}
                      {copiedCode === c.voucher_code ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* =================================================================
          8. ACTIVE OFFERS SECTION (SECTION 14)
          ================================================================= */}
      <div id="offers-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
              Active Store Offers
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
              Special discounts and promo codes from partnered businesses
            </p>
          </div>
        </div>

        {offers.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No active offers right now"
            description="Check back soon for new promotions from your favorite stores."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {offers.slice(0, 4).map((off) => (
              <div
                key={off.id}
                className="card card-hover"
                style={{
                  background: '#FFFFFF',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <Badge style={{ background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700 }}>
                      {off.discount_type === 'PERCENTAGE' ? `${off.discount_val}% OFF` : `₹${off.discount_val} OFF`}
                    </Badge>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      Exp: {off.end_date || 'Ongoing'}
                    </span>
                  </div>

                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
                    {off.title}
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '0.75rem' }}>
                    Min order: ₹{off.min_order || 0}
                  </p>
                </div>

                <div
                  style={{
                    background: '#FAFAFB',
                    border: '1px dashed #CBD5E1',
                    borderRadius: '10px',
                    padding: '0.5rem 0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: '#1A2B49' }}>
                    {off.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyVoucher(off.code)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: copiedCode === off.code ? '#059669' : '#2563EB',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedCode === off.code ? 'Copied ✓' : 'Copy Code'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =================================================================
          9. PARTNERED BUSINESSES (SECTION 15)
          ================================================================= */}
      <div id="businesses-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
              Partnered Businesses
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
              Visit stores to earn rewards and pay directly via UPI
            </p>
          </div>
          <Link to="/customer/businesses" style={{ fontSize: '0.8rem', color: '#1A2B49', fontWeight: 700, textDecoration: 'none' }}>
            View All →
          </Link>
        </div>

        {businesses.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No connected businesses yet"
            description="Scan a ZOOR UP QR code at your favorite local store, cafe, or restaurant to join their loyalty program, collect stamps, and pay via UPI."
            action={
              <Link
                to="/customer/scan-qr"
                className="btn btn-primary"
                style={{
                  background: '#1A2B49',
                  color: '#FFFFFF',
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <QrCode size={16} /> Scan QR to Connect
              </Link>
            }
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {businesses.slice(0, 1).map((biz) => (
              <div
                key={biz.id}
                className="card card-hover"
                style={{
                  background: '#FFFFFF',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <img
                  src={biz.cover_image || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&auto=format&fit=crop&q=80'}
                  alt={biz.name}
                  style={{ width: '100%', height: '120px', borderRadius: '12px', objectFit: 'cover' }}
                />
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', marginBottom: '2px' }}>
                    {biz.name}
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
                    {biz.category} • {biz.city}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid #F1F5F9' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenUpiModal(biz)}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '6px 8px',
                      borderRadius: '8px',
                      background: '#ECFDF5',
                      border: '1px solid #A7F3D0',
                      color: '#047857',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Smartphone size={14} /> Pay via UPI
                  </button>
                  <Link
                    to={`/m/${biz.slug}`}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '6px 8px',
                      borderRadius: '8px',
                      background: '#1A2B49',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Open Menu →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =================================================================
          10. HOW ZOOR UP LOYALTY WORKS (SECTION 15)
          ================================================================= */}
      <div
        className="card"
        style={{
          background: '#FAFAFB',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '1.25rem 1.5rem',
        }}
      >
        <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1A2B49', marginBottom: '1rem' }}>
          How ZOOR UP Loyalty Works
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {[
            { step: '1', title: 'Visit Store', desc: 'Arrive at any partner shop' },
            { step: '2', title: 'Scan QR', desc: 'Scan store counter QR code' },
            { step: '3', title: 'Earn Stamp & Pts', desc: '+1 Stamp & +50 Points instantly' },
            { step: '4', title: 'Level Up', desc: 'Reach Silver, Gold, Platinum & Advance' },
            { step: '5', title: 'Unlock Rewards', desc: 'Claim vouchers & exclusive perks' },
          ].map((s, idx) => (
            <div
              key={idx}
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                padding: '0.85rem',
                border: '1px solid #E2E8F0',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#1A2B49',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.4rem',
                }}
              >
                {s.step}
              </div>
              <strong style={{ fontSize: '0.85rem', color: '#1A2B49', display: 'block' }}>
                {s.title}
              </strong>
              <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '2px' }}>
                {s.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* =================================================================
          12. CLAIM REWARD CONFIRMATION MODAL
          ================================================================= */}
      {selectedRewardForClaim && (
        <Modal
          isOpen={Boolean(selectedRewardForClaim)}
          onClose={() => setSelectedRewardForClaim(null)}
          title="Claim Loyalty Reward"
          maxWidth="440px"
        >
          <div style={{ textAlign: 'center', padding: '0.5rem' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}
            >
              <Gift size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.5rem' }}>
              {selectedRewardForClaim.title}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1.25rem' }}>
              Deduct <strong>{selectedRewardForClaim.points} reward points</strong> to unlock your instant discount voucher code?
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={() => setSelectedRewardForClaim(null)} style={{ flex: 1 }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={claiming}
                onClick={handleConfirmClaimReward}
                style={{ flex: 1.5, background: '#1A2B49', color: '#FFFFFF' }}
              >
                Confirm Claim
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* =================================================================
          13. LEVEL UP / REWARD CELEBRATION MODAL
          ================================================================= */}
      {celebrationData && (
        <Modal
          isOpen={Boolean(celebrationData)}
          onClose={() => setCelebrationData(null)}
          title="Congratulations! 🎉"
          maxWidth="440px"
        >
          <div style={{ textAlign: 'center', padding: '0.75rem' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.35)',
              }}
            >
              <Sparkles size={38} />
            </div>

            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.35rem' }}>
              STAMP EARNED! 🎉
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1.25rem' }}>
              Your visit was confirmed and your digital loyalty pass has been updated!
            </p>

            {celebrationData.levelUp && (
              <div
                style={{
                  background: '#1A2B49',
                  color: '#FFFFFF',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem',
                  border: '1.5px solid #F59E0B',
                }}
              >
                <div style={{ color: '#F59E0B', fontWeight: 800, fontSize: '1.05rem' }}>
                  LEVEL UP! 🎉
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
                  Promoted to <strong>{celebrationData.levelUp.to}</strong> Tier!
                </div>
              </div>
            )}

            {celebrationData.rewardUnlocked && (
              <div
                style={{
                  background: '#ECFDF5',
                  color: '#065F46',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem',
                  border: '1.5px solid #10B981',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                  REWARD UNLOCKED 🎁
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
                  {celebrationData.rewardUnlocked.title}
                </div>
              </div>
            )}

            <div
              style={{
                background: '#FAFAFB',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '0.85rem',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-around',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Stamp</span>
                <strong style={{ fontSize: '1.15rem', color: '#1A2B49' }}>+1 ☕</strong>
              </div>
              <div style={{ width: '1px', background: '#E2E8F0' }} />
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Points</span>
                <strong style={{ fontSize: '1.15rem', color: '#D97706' }}>+{celebrationData.points_awarded || 50} ★</strong>
              </div>
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={() => setCelebrationData(null)}
              style={{ background: '#1A2B49', color: '#FFFFFF' }}
            >
              Awesome! Return to Dashboard
            </Button>
          </div>
        </Modal>
      )}

      {/* Level Up Celebration Modal (Section 7) */}
      <LevelUpModal
        isOpen={!!levelUpModalData}
        onClose={() => setLevelUpModalData(null)}
        levelUpData={levelUpModalData}
        customerName={customerName}
      />
    </div>
  );
};
