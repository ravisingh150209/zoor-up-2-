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
  Smartphone,
  X,
  CreditCard,
  RefreshCw,
  Copy,
  Check,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { loyaltyService } from '../../services/loyaltyService';
import { customerService } from '../../services/customerService';
import { businessService } from '../../services/businessService';
import { notificationService } from '../../services/notificationService';
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

  // UPI Payment Modal State
  const [isUpiModalOpen, setIsUpiModalOpen] = useState(false);
  const [selectedBizForUpi, setSelectedBizForUpi] = useState(null);
  const [upiSettings, setUpiSettings] = useState(null);
  const [upiAmount, setUpiAmount] = useState('150');
  const [upiNote, setUpiNote] = useState('ZOOR UP Bill Payment');
  const [loadingUpi, setLoadingUpi] = useState(false);

  // Check-in Celebration State
  const [celebrationData, setCelebrationData] = useState(null);
  const celebratedRef = useRef(false);

  const customerId = profile?.customer_id || user?.customer_id || (user?.id ? `ZUP-CUS-${user.id.slice(-6).toUpperCase()}` : 'ZUP-CUS-MEMBER');
  const customerName = profile?.name || user?.name || 'Customer';
  const customerPoints = selectedBusinessId && loyaltyStatus ? Number(loyaltyStatus.points ?? 0) : Number(profile?.points ?? user?.points ?? 0);
  const customerStamps = selectedBusinessId && loyaltyStatus ? Number(loyaltyStatus.stamps ?? 0) : Number(profile?.stamps ?? user?.stamps ?? 0);
  const totalVisits = Number(profile?.visits ?? visits.length ?? 0);
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

  const loadAllDashboardData = async () => {
    setLoading(true);
    setError(null);
    setBusinessScopeError(null);
    try {
      const homeData = await customerService.getCustomerHome();

      if (homeData && homeData.success) {
        const cProfile = homeData.customer;
        const connBiz = homeData.businesses || [];
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
          : connBiz.length === 1
            ? connBiz[0].id
            : null;

        setSelectedBusinessId(nextSelectedBusinessId);

        if (nextSelectedBusinessId) {
          try {
            const businessLoyalty = await loyaltyService.getBusinessLoyalty(nextSelectedBusinessId);
            setLoyaltyStatus(businessLoyalty);
          } catch (businessErr) {
            setBusinessScopeError(businessErr.message || 'Unable to load loyalty data.');
            setLoyaltyStatus(null);
          }
        } else {
          setLoyaltyStatus(null);
          setBusinessScopeError('No business selected. Choose a connected business to view loyalty.');
        }

        const [allRewards, allClaimed, bizOffers] = await Promise.all([
          loyaltyService.getRewards(nextSelectedBusinessId || null),
          loyaltyService.getClaimedRewards(cProfile?.customer_id || customerId),
          nextSelectedBusinessId
            ? loyaltyService.getOffers(nextSelectedBusinessId)
            : (connBiz.length > 0 ? loyaltyService.getOffers(connBiz[0].id) : Promise.resolve([])),
        ]);
        setRewards(allRewards || []);
        setClaimedRewards(allClaimed || []);
        setOffers(Array.isArray(bizOffers) ? bizOffers.filter((o) => o.active) : []);

        notificationService.runReminderEngine(user).catch(() => {});
        return;
      }

      throw new Error('Unable to load your connected businesses.');
    } catch (err) {
      console.error('Error loading customer dashboard data:', err);
      setError(err.message || 'Unable to load your loyalty card.');
    } finally {
      setLoading(false);
    }
  };

  // UPI Payment Flow
  const handleOpenUpiModal = async (business = null) => {
    const targetBiz = business || businesses[0] || null;
    setSelectedBizForUpi(targetBiz);
    setIsUpiModalOpen(true);

    if (targetBiz?.id) {
      setLoadingUpi(true);
      try {
        const upi = await businessService.getUpiSettings(targetBiz.id);
        setUpiSettings(upi);
      } catch (e) {
        console.error('Failed to load UPI config:', e);
      } finally {
        setLoadingUpi(false);
      }
    }
  };

  const handleSelectUpiBusiness = async (bizId) => {
    const biz = businesses.find(b => b.id === bizId);
    setSelectedBizForUpi(biz);
    if (biz?.id) {
      setLoadingUpi(true);
      try {
        const upi = await businessService.getUpiSettings(biz.id);
        setUpiSettings(upi);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingUpi(false);
      }
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

      // Refresh data
      loadAllDashboardData();
    } catch (err) {
      addToast(err.message || 'Could not claim reward', 'error');
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

  // Generate UPI URL
  const upiPaymentUrl = upiSettings?.upi_id
    ? businessService.generateUpiPaymentUrl({
        upi_id: upiSettings.upi_id,
        upi_name: upiSettings.upi_name || selectedBizForUpi?.name || 'Store Merchant',
        amount: upiAmount || '0',
        note: upiNote || 'Store Payment',
      })
    : '';

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
  if (!hasBusinessSelection && businesses.length > 0) {
    return (
      <div style={{ maxWidth: '660px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem 1rem' }}>
        <div className="card" style={{ padding: '1.5rem', borderRadius: '18px', background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: '0 0 0.5rem' }}>No business selected</h3>
          <p style={{ margin: 0, color: '#64748B' }}>
            Choose a connected business to view points, stamps, and rewards.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {businesses.map((biz) => (
            <Button key={biz.id} variant="secondary" onClick={() => {
              setSelectedBusinessId(biz.id);
              setBusinessScopeError(null);
              loyaltyService.getBusinessLoyalty(biz.id).then((data) => setLoyaltyStatus(data)).catch((err) => setBusinessScopeError(err.message || 'Unable to load loyalty data.'));
            }}>
              {biz.name || 'Business'}
            </Button>
          ))}
        </div>
        {businessScopeError && (
          <div className="card" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid #FECACA', background: '#FEF2F2', color: '#991B1B' }}>
            {businessScopeError}
          </div>
        )}
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

      {/* Multi-Store Switcher */}
      {businesses.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.65rem 0.9rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>
            🏪 Connected Store:
          </span>
          {businesses.map((biz) => {
            const isSelected = selectedBusinessId === biz.id;
            return (
              <button
                key={biz.id}
                type="button"
                onClick={async () => {
                  setSelectedBusinessId(biz.id);
                  setBusinessScopeError(null);
                  try {
                    const [loyal, rew, off] = await Promise.all([
                      loyaltyService.getBusinessLoyalty(biz.id),
                      loyaltyService.getRewards(biz.id),
                      loyaltyService.getOffers(biz.id)
                    ]);
                    setLoyaltyStatus(loyal);
                    setRewards(rew || []);
                    setOffers(Array.isArray(off) ? off.filter(o => o.active) : []);
                  } catch (err) {
                    setBusinessScopeError(err.message || 'Unable to switch store');
                  }
                }}
                style={{
                  border: isSelected ? '1.5px solid #1A2B49' : '1px solid #CBD5E1',
                  background: isSelected ? '#1A2B49' : '#F8FAFC',
                  color: isSelected ? '#FFFFFF' : '#334155',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {biz.name || 'Store'}
              </button>
            );
          })}
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
            {businesses.slice(0, 3).map((biz) => (
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
          11. CUSTOMER PAY BUSINESS VIA UPI MODAL (SECTIONS 20–24)
          ================================================================= */}
      <Modal
        isOpen={isUpiModalOpen}
        onClose={() => setIsUpiModalOpen(false)}
        title="Pay Business via UPI"
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Store Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
              Select Partnered Store
            </label>
            <select
              value={selectedBizForUpi?.id || ''}
              onChange={(e) => handleSelectUpiBusiness(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '10px',
                border: '1.5px solid #CBD5E1',
                fontSize: '0.9rem',
                color: '#1A2B49',
                outline: 'none',
              }}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.city})
                </option>
              ))}
            </select>
          </div>

          {loadingUpi ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
              Loading store UPI details...
            </div>
          ) : upiSettings?.upi_id ? (
            <>
              {/* Payment Amount & Note */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={upiAmount}
                    onChange={(e) => setUpiAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: '#1A2B49',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
                    Payment Note
                  </label>
                  <input
                    type="text"
                    value={upiNote}
                    onChange={(e) => setUpiNote(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.9rem',
                      color: '#1A2B49',
                    }}
                  />
                </div>
              </div>

              {/* Scannable Store Payment QR */}
              <div
                style={{
                  background: '#FAFAFB',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    background: '#FFFFFF',
                    padding: '12px',
                    borderRadius: '14px',
                    display: 'inline-block',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  }}
                >
                  <QRCodeSVG value={upiPaymentUrl} size={150} level="M" />
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49', display: 'block' }}>
                    {upiSettings.upi_name || selectedBizForUpi?.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#64748B' }}>
                    {upiSettings.upi_id}
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                  Scan with GPay, PhonePe, Paytm, BHIM, or any UPI App
                </span>
              </div>

              {/* Direct UPI Payment Intent Button for Mobile */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <a
                  href={upiPaymentUrl}
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    background: '#1A2B49',
                    color: '#FFFFFF',
                    padding: '0.85rem',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontWeight: 700,
                  }}
                >
                  <Smartphone size={18} /> Pay via UPI App (₹{upiAmount || 0})
                </a>
                <p style={{ fontSize: '0.72rem', color: '#64748B', textAlign: 'center', margin: 0 }}>
                  ⚠️ Status will show "Payment initiated" until verified at store counter.
                </p>
              </div>
            </>
          ) : (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', background: '#FAFAFB', borderRadius: '12px' }}>
              <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>
                This store has not configured a direct UPI ID yet. You can pay at the counter or via order checkout.
              </p>
            </div>
          )}
        </div>
      </Modal>

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
