import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Award, Sparkles, Check, ChevronRight, X, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export const LevelUpModal = ({
  isOpen,
  onClose,
  levelUpData, // { from_level, to_level, from_name, to_name, badge, perk }
  customerName = 'Valued Member'
}) => {
  useEffect(() => {
    if (isOpen && levelUpData) {
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.5 },
          colors: ['#F59E0B', '#FDE68A', '#1A2B49', '#E2E8F0', '#38BDF8'],
        });
        const timer = setTimeout(() => {
          confetti({
            particleCount: 60,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#F59E0B', '#FDE68A', '#38BDF8'],
          });
          confetti({
            particleCount: 60,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#F59E0B', '#FDE68A', '#38BDF8'],
          });
        }, 300);
        return () => clearTimeout(timer);
      } catch (e) {}
    }
  }, [isOpen, levelUpData]);

  if (!isOpen || !levelUpData) return null;

  const toName = levelUpData.to_name || `LEVEL ${levelUpData.to_level}`;
  const fromName = levelUpData.from_name || `LEVEL ${levelUpData.from_level}`;
  const toLevel = levelUpData.to_level || 2;

  const getTierColor = (lvl) => {
    switch (lvl) {
      case 2: return '#CBD5E1'; // SILVER
      case 3: return '#F59E0B'; // GOLD
      case 4: return '#38BDF8'; // PLATINUM
      case 5: return '#A855F7'; // ADVANCE
      default: return '#F59E0B';
    }
  };

  const tierColor = getTierColor(toLevel);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        background: 'rgba(10, 16, 29, 0.75)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.25s ease-out',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'linear-gradient(160deg, #1A2B49 0%, #0F172A 100%)',
          border: `2px solid ${tierColor}`,
          borderRadius: '24px',
          padding: '2rem 1.75rem',
          textAlign: 'center',
          color: '#FFFFFF',
          boxShadow: `0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px ${tierColor}33`,
          position: 'relative',
          overflow: 'hidden',
          animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Ambient Top Glow */}
        <div
          style={{
            position: 'absolute',
            top: '-30%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '240px',
            height: '240px',
            background: `radial-gradient(circle, ${tierColor}40 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#CBD5E1',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          <X size={18} />
        </button>

        {/* Emblem Crown */}
        <div
          style={{
            width: '76px',
            height: '76px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${tierColor} 0%, #1A2B49 100%)`,
            border: `2px solid #FFFFFF`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            boxShadow: `0 8px 25px ${tierColor}66`,
          }}
        >
          <Award size={40} color="#FFFFFF" />
        </div>

        {/* Level Up Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid #F59E0B',
            padding: '4px 14px',
            borderRadius: '999px',
            fontSize: '0.8rem',
            fontWeight: 800,
            color: '#F59E0B',
            letterSpacing: '0.08em',
            marginBottom: '0.85rem',
          }}
        >
          <Sparkles size={14} />
          <span>LEVEL UP UNLOCKED</span>
        </div>

        <h3 style={{ fontSize: '1.65rem', fontWeight: 800, margin: '0 0 0.4rem', color: '#FFFFFF' }}>
          Congratulations, {customerName}!
        </h3>

        <p style={{ color: '#CBD5E1', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>
          Your loyalty journey has reached a new milestone.
        </p>

        {/* Tier Upgrade Banner */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', display: 'block' }}>
              Previous Tier
            </span>
            <strong style={{ fontSize: '0.95rem', color: '#CBD5E1' }}>{fromName}</strong>
          </div>

          <ChevronRight size={22} color={tierColor} />

          <div>
            <span style={{ fontSize: '0.75rem', color: tierColor, textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>
              New Tier
            </span>
            <strong style={{ fontSize: '1.15rem', color: '#FFFFFF', letterSpacing: '0.02em' }}>
              {toName}
            </strong>
          </div>
        </div>

        {/* Unlocked Tier Perk */}
        {levelUpData.perk && (
          <div
            style={{
              background: `${tierColor}18`,
              border: `1px solid ${tierColor}40`,
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              fontSize: '0.85rem',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <ShieldCheck size={18} color={tierColor} />
            <span>Unlocked Perk: <strong>{levelUpData.perk}</strong></span>
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          block
          onClick={onClose}
          style={{
            padding: '0.85rem',
            fontSize: '1rem',
            fontWeight: 800,
            background: `linear-gradient(135deg, ${tierColor} 0%, #D97706 100%)`,
            border: 'none',
            color: '#1A2B49',
          }}
        >
          Explore Your {toName} Card
        </Button>
      </div>
    </div>
  );
};
