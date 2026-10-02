import React from 'react';
import { Check, Crown, Lock, ChevronRight, Sparkles } from 'lucide-react';
import { LOYALTY_LEVELS } from '../../services/loyaltyService';

export const LevelProgressTracker = ({
  levelInfo,
  totalPoints = 0
}) => {
  const currentLevel = levelInfo?.currentLevel || 1;
  const tiers = LOYALTY_LEVELS;

  return (
    <div
      className="card"
      style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '18px',
        padding: '1.35rem 1.5rem',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <span style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, display: 'block' }}>
            VIP Progression
          </span>
          <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1A2B49', margin: '2px 0 0' }}>
            Level {currentLevel}: {levelInfo?.currentTier?.name || 'BASIC'}
          </h4>
        </div>

        <div style={{ textAlign: 'right' }}>
          {levelInfo?.nextTier ? (
            <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
              Next: <strong style={{ color: '#F59E0B' }}>{levelInfo.nextTier.name}</strong> ({levelInfo.pointsNeeded} pts remaining)
            </span>
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#16A34A', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={14} /> Maximum Tier Reached
            </span>
          )}
        </div>
      </div>

      {/* 5-Step Progressive Horizontal Path */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem', position: 'relative', marginBottom: '1rem' }}>
        {tiers.map((t) => {
          const isPassed = t.level < currentLevel;
          const isCurrent = t.level === currentLevel;
          const isFuture = t.level > currentLevel;

          return (
            <div
              key={t.level}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                position: 'relative',
              }}
            >
              {/* Step Circle / Badge */}
              <div
                style={{
                  width: isCurrent ? '34px' : '28px',
                  height: isCurrent ? '34px' : '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isCurrent
                    ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                    : isPassed
                    ? '#1A2B49'
                    : '#F1F5F9',
                  color: (isCurrent || isPassed) ? '#FFFFFF' : '#94A3B8',
                  border: isCurrent
                    ? '2px solid #FEF3C7'
                    : isPassed
                    ? '1.5px solid #1A2B49'
                    : '1px solid #CBD5E1',
                  boxShadow: isCurrent ? '0 0 12px rgba(245, 158, 11, 0.45)' : 'none',
                  transition: 'all 0.3s ease',
                  marginBottom: '6px',
                }}
              >
                {isPassed ? (
                  <Check size={14} strokeWidth={3} />
                ) : isCurrent ? (
                  <Crown size={16} />
                ) : (
                  <Lock size={12} />
                )}
              </div>

              {/* Tier Name */}
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: isCurrent ? 800 : 700,
                  color: isCurrent ? '#F59E0B' : isPassed ? '#1A2B49' : '#94A3B8',
                  letterSpacing: '0.02em',
                }}
              >
                {t.name}
              </span>

              {/* Status Indicator */}
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  color: isCurrent ? '#B45309' : isPassed ? '#16A34A' : '#94A3B8',
                  marginTop: '1px',
                }}
              >
                {isPassed ? '✓ Done' : isCurrent ? '● Current' : `${t.minPoints} pts`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '8px',
          background: '#F1F5F9',
          borderRadius: '999px',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
      >
        <div
          style={{
            width: `${levelInfo?.progress || 0}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
            borderRadius: '999px',
            transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>

      {/* Active Tier Perk */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.65rem', fontSize: '0.78rem', color: '#64748B' }}>
        <span>Active Perk: <strong style={{ color: '#1A2B49' }}>{levelInfo?.currentTier?.perk || '1x Points on Purchases'}</strong></span>
        <span>{levelInfo?.progress || 0}% toward next tier</span>
      </div>
    </div>
  );
};

export default LevelProgressTracker;
