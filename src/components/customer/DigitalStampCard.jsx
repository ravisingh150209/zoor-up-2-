import React from 'react';
import { Award, Sparkles, Check, QrCode, Gift, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * ZOOR UP Main Hero Digital Stamp Card
 * Premium Aesthetic: Deep Navy (#1A2B49), Amber (#F59E0B), Off-white (#FAFAFB)
 * Dynamic progress, filled vs empty stamps, reward unlock state.
 */
export const DigitalStampCard = ({
  businessName = 'ZOOR UP Universal Network',
  customerName = 'Valued Customer',
  customerId = 'ZUP-CUS-000001',
  stamps = 0,
  maxStamps = 10,
}) => {
  const currentStamps = Number(stamps || 0);
  const cycleStamps = currentStamps % maxStamps;
  const displayStamps = currentStamps > 0 && cycleStamps === 0 ? maxStamps : cycleStamps;
  const isRewardUnlocked = currentStamps >= maxStamps;
  const stampsNeeded = maxStamps - displayStamps;
  const progressPercent = Math.min(100, Math.round((displayStamps / maxStamps) * 100));

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, #1A2B49 0%, #0F1A2E 100%)',
        borderRadius: '20px',
        padding: '1.5rem 1.6rem',
        color: '#FAFAFB',
        border: '1.5px solid rgba(245, 158, 11, 0.35)',
        boxShadow: '0 12px 36px rgba(15, 26, 46, 0.45), 0 0 20px rgba(245, 158, 11, 0.1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative ambient background glows */}
      <div
        style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '160px',
          height: '160px',
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, rgba(26, 43, 73, 0) 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-30px',
          left: '-30px',
          width: '130px',
          height: '130px',
          background: 'radial-gradient(circle, rgba(217, 119, 6, 0.12) 0%, rgba(26, 43, 73, 0) 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      {/* Header: Business & Card Identity */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
          position: 'relative',
          zIndex: 1,
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '3px 10px',
              borderRadius: '999px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#F59E0B',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: '0.4rem',
            }}
          >
            <Sparkles size={12} />
            <span>Digital Stamp Card</span>
          </div>
          <h2
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: '#FAFAFB',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            {businessName}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
            <span style={{ fontSize: '0.825rem', color: '#94A3B8' }}>{customerName}</span>
            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>•</span>
            <span
              style={{
                fontSize: '0.78rem',
                color: '#F59E0B',
                fontFamily: 'monospace',
                fontWeight: 600,
                letterSpacing: '0.03em',
              }}
            >
              {customerId}
            </span>
          </div>
        </div>

        {/* Counter Badge */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '0.45rem 0.85rem',
            textAlign: 'right',
          }}
        >
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Current Progress
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#F59E0B' }}>
            {displayStamps} <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: 600 }}>/ {maxStamps}</span>
          </div>
        </div>
      </div>

      {/* 10 Stamp Circle Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '0.65rem',
          margin: '1.25rem 0',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {Array.from({ length: maxStamps }).map((_, idx) => {
          const stampNumber = idx + 1;
          const isFilled = stampNumber <= displayStamps;
          const isLastStamp = stampNumber === maxStamps;

          return (
            <div
              key={stampNumber}
              style={{
                aspectRatio: '1',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: isFilled
                  ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                  : 'rgba(255, 255, 255, 0.04)',
                border: isFilled
                  ? '2px solid #FDE68A'
                  : isLastStamp
                  ? '2px dashed rgba(245, 158, 11, 0.45)'
                  : '1.5px dashed rgba(255, 255, 255, 0.16)',
                color: isFilled ? '#1A2B49' : '#64748B',
                boxShadow: isFilled
                  ? '0 4px 14px rgba(245, 158, 11, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.4)'
                  : 'none',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                position: 'relative',
              }}
            >
              {isFilled ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {isLastStamp ? <Gift size={20} color="#1A2B49" /> : <Check size={20} strokeWidth={3} color="#1A2B49" />}
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, marginTop: '2px' }}>#{stampNumber}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {isLastStamp ? (
                    <Gift size={18} color="#F59E0B" style={{ opacity: 0.7 }} />
                  ) : (
                    <Award size={18} style={{ opacity: 0.35 }} />
                  )}
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, marginTop: '2px', color: '#94A3B8' }}>
                    {stampNumber}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Track & Unlock State */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            height: '7px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '999px',
            overflow: 'hidden',
            marginBottom: '0.75rem',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 100%)',
              borderRadius: '999px',
              transition: 'width 0.6s ease',
              boxShadow: '0 0 10px rgba(245, 158, 11, 0.6)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {isRewardUnlocked ? (
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34D399', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Sparkles size={16} /> Reward Unlocked! Free perk ready to redeem
              </span>
            ) : (
              <span style={{ fontSize: '0.825rem', color: '#CBD5E1', fontWeight: 500 }}>
                {stampsNeeded > 0 ? (
                  <>
                    <strong style={{ color: '#F59E0B' }}>{stampsNeeded}</strong> more stamp{stampsNeeded === 1 ? '' : 's'} to unlock reward
                  </>
                ) : (
                  'Stamp card complete!'
                )}
              </span>
            )}
          </div>

          <Link
            to="/customer/scan-qr"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#FDE68A',
              fontSize: '0.775rem',
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'background 0.2s ease',
            }}
          >
            <QrCode size={13} />
            <span>Scan to Earn Stamp</span>
            <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
};
