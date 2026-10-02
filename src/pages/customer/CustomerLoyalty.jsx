import React, { useState, useEffect } from 'react';
import {
  Award,
  Gift,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Clock,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Copy,
  Ticket
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { RANK_TIERS, loyaltyService } from '../../services/loyaltyService';
import { customerService } from '../../services/customerService';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const CustomerLoyalty = () => {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();

  const [points, setPoints] = useState(null);
  const [stamps, setStamps] = useState(null);
  const [visits, setVisits] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [claimedRewards, setClaimedRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [selectedReward, setSelectedReward] = useState(null);
  const [redeeming, setRedeeming] = useState(false);
  const [activeTab, setActiveTab] = useState('REWARDS'); // 'REWARDS' | 'VOUCHERS' | 'TIERS'

  const customerId = user?.customer_id || user?.id;

  useEffect(() => {
    loadLoyaltyData();
  }, [customerId]);

  const loadLoyaltyData = async () => {
    setLoading(true);
    setError(null);
    try {
      const homeData = await customerService.getCustomerHome();
      if (!homeData || !homeData.success) {
        throw new Error('Unable to load connected businesses.');
      }

      const connectedBusinesses = homeData.businesses || [];
      setBusinesses(connectedBusinesses);

      if (!connectedBusinesses.length) {
        setSelectedBusinessId(null);
        setPoints(null);
        setStamps(null);
        setVisits(null);
        setRewards([]);
        setClaimedRewards([]);
        return;
      }

      const chosenBusinessId = selectedBusinessId && connectedBusinesses.some((biz) => biz.id === selectedBusinessId)
        ? selectedBusinessId
        : connectedBusinesses.length === 1
          ? connectedBusinesses[0].id
          : null;

      setSelectedBusinessId(chosenBusinessId);

      if (!chosenBusinessId) {
        setPoints(null);
        setStamps(null);
        setVisits(null);
        setRewards([]);
        setClaimedRewards([]);
        return;
      }

      const [businessLoyalty, allRewards, claimed] = await Promise.all([
        loyaltyService.getBusinessLoyalty(chosenBusinessId),
        loyaltyService.getRewards(chosenBusinessId),
        customerId ? loyaltyService.getClaimedRewards(customerId).catch(() => []) : Promise.resolve([]),
      ]);

      setPoints(Number(businessLoyalty?.points ?? 0));
      setStamps(Number(businessLoyalty?.stamps ?? 0));
      setVisits(Number(businessLoyalty?.visits ?? 0));
      setRewards(Array.isArray(allRewards) ? allRewards : []);
      setClaimedRewards(Array.isArray(claimed) ? claimed : []);
    } catch (err) {
      console.error('Failed to load loyalty rewards:', err);
      setError(err.message || 'Unable to load loyalty rewards. Please check your connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  const rankInfo = loyaltyService.getRankInfo(points ?? 0);

  const handleRedeem = async (reward) => {
    if (!reward) return;

    if (points < (reward.points || 0)) {
      addToast(`You need ${(reward.points || 0) - points} more points for this reward.`, 'error');
      return;
    }

    setRedeeming(true);
    try {
      const res = await loyaltyService.claimReward(customerId, reward.id, reward.business_id);
      
      setSelectedReward(null);
      await loadLoyaltyData();

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // Safe catch if canvas-confetti is blocked
      }

      addToast(
        `🎉 Successfully claimed "${reward.title}"! Voucher: ${res?.voucher_code || res?.redemption_code || 'VOUCHER-ACTIVE'}`,
        'success'
      );

      // Reload claimed rewards
      const updatedClaimed = await loyaltyService.getClaimedRewards(customerId).catch(() => []);
      setClaimedRewards(Array.isArray(updatedClaimed) ? updatedClaimed : []);

      if (typeof refreshUser === 'function') {
        refreshUser().catch(() => {});
      }
    } catch (err) {
      addToast(err.message || 'Reward redemption failed. Please try again.', 'error');
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading your rewards & loyalty balance..." />;
  }

  if (error) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', padding: '2rem 1rem' }}>
        <div
          className="card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #FCA5A5',
            borderRadius: '16px',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <AlertCircle size={44} style={{ color: '#EF4444', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.5rem' }}>
            Unable to Load Loyalty Data
          </h3>
          <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {error}
          </p>
          <Button variant="primary" icon={RefreshCw} onClick={loadLoyaltyData}>
            Retry Now
          </Button>
        </div>
      </div>
    );
  }

  if (!selectedBusinessId && businesses.length > 0) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', padding: '2rem 1rem' }}>
        <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '2rem 1.5rem', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: '0 0 0.5rem' }}>No business selected</h3>
          <p style={{ color: '#64748B', marginBottom: '1rem' }}>Choose a connected business to view points, stamps, and rewards.</p>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            {businesses.map((biz) => (
              <Button key={biz.id} variant="secondary" onClick={() => {
                setSelectedBusinessId(biz.id);
                loadLoyaltyData();
              }}>
                {biz.name || 'Business'}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!selectedBusinessId && businesses.length === 0) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', padding: '2rem 1rem' }}>
        <div className="card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '2rem 1.5rem', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: '0 0 0.5rem' }}>No businesses connected yet.</h3>
          <p style={{ color: '#64748B', margin: 0 }}>Connect with a business and then return here to see your loyalty balance.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      {/* Page Header */}
      <div>
        <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
          Rewards & Loyalty Pass
        </h2>
        <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '4px 0 0' }}>
          Earn points on purchases and stamps on visits. Unlock free vouchers and perks.
        </p>
      </div>

      {/* Primary Points Card: Deep Navy #1A2B49 with Amber #F59E0B Highlights */}
      <Card
        style={{
          background: '#1A2B49',
          border: '1px solid #243B5F',
          borderRadius: '18px',
          padding: '1.75rem',
          color: '#FFFFFF',
          boxShadow: '0 8px 24px rgba(26, 43, 73, 0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Available Loyalty Balance
            </span>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#F59E0B', margin: '0.25rem 0' }}>
              {(points ?? 0).toLocaleString()} <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#FFFFFF' }}>Points</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#CBD5E1', margin: 0 }}>
              Current Rank: <strong style={{ color: '#F59E0B' }}>{rankInfo.currentTier?.rank || 'STARTER'} Tier</strong> • {rankInfo.currentTier?.perk || '1x Points on Purchases'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Badge style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', background: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B', border: '1px solid #F59E0B' }}>
              {rankInfo.currentTier?.rank || 'STARTER'} VIP
            </Badge>
            <Badge style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', background: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)' }}>
              {stamps ?? 0} Stamps
            </Badge>
          </div>
        </div>

        {/* Progress Bar to Next Tier */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '8px', color: '#CBD5E1' }}>
            <span>Progress to Next Rank</span>
            {rankInfo.nextTier ? (
              <span style={{ color: '#F59E0B', fontWeight: 600 }}>
                {rankInfo.pointsNeeded} pts until {rankInfo.nextTier.rank}
              </span>
            ) : (
              <span style={{ color: '#A855F7', fontWeight: 600 }}>Maximum Rank Achieved 🎉</span>
            )}
          </div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, rankInfo.progress || 0))}%`,
                height: '100%',
                background: '#F59E0B',
                borderRadius: '999px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </Card>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('REWARDS')}
          style={{
            border: 'none',
            background: activeTab === 'REWARDS' ? '#1A2B49' : 'transparent',
            color: activeTab === 'REWARDS' ? '#FFFFFF' : '#64748B',
            fontWeight: 700,
            fontSize: '0.85rem',
            padding: '8px 16px',
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Available Rewards ({rewards.length})
        </button>

        <button
          onClick={() => setActiveTab('VOUCHERS')}
          style={{
            border: 'none',
            background: activeTab === 'VOUCHERS' ? '#1A2B49' : 'transparent',
            color: activeTab === 'VOUCHERS' ? '#FFFFFF' : '#64748B',
            fontWeight: 700,
            fontSize: '0.85rem',
            padding: '8px 16px',
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          My Claimed Vouchers ({claimedRewards.length})
        </button>

        <button
          onClick={() => setActiveTab('TIERS')}
          style={{
            border: 'none',
            background: activeTab === 'TIERS' ? '#1A2B49' : 'transparent',
            color: activeTab === 'TIERS' ? '#FFFFFF' : '#64748B',
            fontWeight: 700,
            fontSize: '0.85rem',
            padding: '8px 16px',
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Tier Benefits
        </button>
      </div>

      {/* TAB 1: REWARDS CATALOG */}
      {activeTab === 'REWARDS' && (
        <div>
          {rewards.length === 0 ? (
            <EmptyState
              icon={Gift}
              title="No rewards available yet"
              description="Keep visiting your favorite stores to earn stamps and points. Rewards published by partner businesses will appear here."
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
              }}
            >
              {rewards.map((rew) => {
                const reqPoints = rew.points || 0;
                const canAfford = points >= reqPoints;

                return (
                  <Card
                    key={rew.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: '1.25rem',
                      background: '#FFFFFF',
                      borderRadius: '16px',
                      border: '1.5px solid #E2E8F0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div>
                      {/* Image / Icon container */}
                      {rew.image_url ? (
                        <div
                          style={{
                            height: '130px',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            marginBottom: '0.75rem',
                            background: '#F1F5F9',
                          }}
                        >
                          <img
                            src={rew.image_url}
                            alt={rew.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            height: '80px',
                            borderRadius: '12px',
                            marginBottom: '0.75rem',
                            background: '#FEF3C7',
                            color: '#D97706',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Gift size={32} />
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                          {rew.category || 'Voucher'}
                        </span>
                        <Badge variant={canAfford ? 'warning' : 'neutral'}>
                          {reqPoints} pts
                        </Badge>
                      </div>

                      <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1A2B49', marginBottom: '0.35rem' }}>
                        {rew.title}
                      </h4>

                      {rew.description && (
                        <p style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '0.5rem', lineHeight: 1.4 }}>
                          {rew.description}
                        </p>
                      )}

                      <div style={{ fontSize: '0.825rem', color: '#059669', fontWeight: 600, marginTop: '0.25rem' }}>
                        Value: ₹{rew.value || 100} discount
                      </div>
                    </div>

                    <div style={{ marginTop: '1.25rem' }}>
                      <Button
                        variant={canAfford ? 'primary' : 'outline'}
                        size="sm"
                        block
                        disabled={!canAfford}
                        onClick={() => setSelectedReward(rew)}
                      >
                        {canAfford ? 'Redeem Voucher' : `Need ${reqPoints - points} more pts`}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY CLAIMED VOUCHERS */}
      {activeTab === 'VOUCHERS' && (
        <div>
          {claimedRewards.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title="No vouchers claimed yet"
              description="Redeem your available points on the Rewards tab to generate redeemable voucher codes."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {claimedRewards.map((claim) => (
                <div
                  key={claim.id || claim.code}
                  className="card"
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '14px',
                    padding: '1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <Badge variant="success" style={{ marginBottom: '0.4rem' }}>
                      ACTIVE VOUCHER
                    </Badge>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', margin: 0 }}>
                      {claim.reward_title || claim.title || 'Special Store Voucher'}
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0' }}>
                      Claimed on: {new Date(claim.claimed_at || claim.created_at || Date.now()).toLocaleDateString()}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', textTransform: 'uppercase' }}>
                      Voucher Code
                    </span>
                    <strong style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: '#1A2B49', letterSpacing: '0.05em' }}>
                      {claim.code || claim.voucher_code || 'ZUP-VOUCHER'}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TIER BENEFITS */}
      {activeTab === 'TIERS' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
          }}
        >
          {RANK_TIERS.map((tier) => {
            const isCurrent = rankInfo.currentTier?.rank === tier.rank;
            return (
              <Card
                key={tier.rank}
                style={{
                  borderLeft: `4px solid ${tier.color}`,
                  background: isCurrent ? '#F8FAFC' : '#FFFFFF',
                  padding: '1.25rem',
                  borderRadius: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
                      {tier.rank}
                    </h4>
                    {isCurrent && (
                      <Badge variant="warning" style={{ fontSize: '0.7rem' }}>
                        Your Tier
                      </Badge>
                    )}
                  </div>
                  <Badge variant="neutral" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    {tier.max === Infinity ? '5,000+' : `${tier.min} - ${tier.max}`} pts
                  </Badge>
                  <p style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: 1.4, margin: '0.5rem 0 0' }}>
                    {tier.perk}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm Redemption Modal */}
      {selectedReward && (
        <Modal
          isOpen={Boolean(selectedReward)}
          onClose={() => setSelectedReward(null)}
          title="Confirm Reward Redemption"
          footer={
            <>
              <Button variant="secondary" onClick={() => setSelectedReward(null)} disabled={redeeming}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={redeeming}
                onClick={() => handleRedeem(selectedReward)}
              >
                Claim Voucher (-{selectedReward.points || 0} pts)
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.9rem' }}>
            <p style={{ margin: 0 }}>
              Are you sure you want to redeem <strong>{selectedReward.title}</strong>?
            </p>
            <div style={{ padding: '0.85rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748B' }}>Points Required:</span>
                <strong style={{ color: '#D97706' }}>{selectedReward.points || 0} pts</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Remaining Balance:</span>
                <strong style={{ color: '#1A2B49' }}>{points - (selectedReward.points || 0)} pts</strong>
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
              Once claimed, a unique voucher code will be issued instantly for in-store redemption.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};
