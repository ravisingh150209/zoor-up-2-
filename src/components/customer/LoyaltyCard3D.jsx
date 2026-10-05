import React, { useState, useRef, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Sparkles,
  ShieldCheck,
  QrCode,
  RotateCcw,
  Award,
  Crown,
  Compass,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { ZoorUpLogo } from '../ui/ZoorUpLogo';
import { Badge } from '../ui/Badge';

/**
 * ZOOR UP 3D Dynamic Loyalty Card
 * Supports 5 Evolutionary Tiers:
 * LEVEL 1: BASIC
 * LEVEL 2: SILVER
 * LEVEL 3: GOLD
 * LEVEL 4: PLATINUM
 * LEVEL 5: ADVANCE
 *
 * Full 360° Interactive drag/touch orbit, 3D flip, and ambient auto-rotate.
 */
export const LoyaltyCard3D = ({
  customerName = 'Valued Member',
  customerId = 'ZUP-CUS-MEMBER',
  points = 0,
  stamps = 0,
  maxStamps = 10,
  levelInfo = null,
  totalVisits = 0,
  lifetimePoints = 0,
  joinedDate = '2026',
  loading = false,
  onFlip,
}) => {
  // 3D Rotation & Flip State
  const [rotationY, setRotationY] = useState(0);
  const [tiltX, setTiltX] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const cardContainerRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, startRotY: 0, startTiltX: 0 });
  const autoRotateRafRef = useRef(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Determine Current Tier details (Level 1 to 5)
  const currentLevel = levelInfo?.currentLevel || 1;
  const currentTierName = (levelInfo?.currentTier?.name || 'BASIC').toUpperCase();

  // Tier Theme Config
  const getTierTheme = (level, name) => {
    const lvl = Number(level) || 1;
    switch (lvl) {
      case 2:
        return {
          id: 'SILVER',
          displayName: 'SILVER VIP',
          crownColor: '#E2E8F0',
          accent: '#CBD5E1',
          subAccent: '#94A3B8',
          cardBg: 'linear-gradient(135deg, #2D3748 0%, #1A202C 45%, #0F172A 100%)',
          cardBorder: '1.5px solid rgba(226, 232, 240, 0.75)',
          glow: '0 20px 45px -10px rgba(30, 41, 59, 0.5), 0 0 30px rgba(203, 213, 225, 0.2)',
          chipBg: 'linear-gradient(135deg, #F1F5F9 0%, #94A3B8 100%)',
          chipBorder: '#E2E8F0',
          badgeBg: 'rgba(203, 213, 225, 0.18)',
          badgeBorder: '1px solid rgba(203, 213, 225, 0.5)',
          badgeColor: '#E2E8F0',
          sheen: 'radial-gradient(circle, rgba(226, 232, 240, 0.22) 0%, transparent 70%)',
          stripColor: '#0F172A'
        };
      case 3:
        return {
          id: 'GOLD',
          displayName: 'GOLD PRIVILEGE',
          crownColor: '#F59E0B',
          accent: '#F59E0B',
          subAccent: '#FDE68A',
          cardBg: 'linear-gradient(135deg, #231C12 0%, #15110A 50%, #0B0905 100%)',
          cardBorder: '2px solid #F59E0B',
          glow: '0 25px 50px -10px rgba(217, 119, 6, 0.4), 0 0 35px rgba(245, 158, 11, 0.3)',
          chipBg: 'linear-gradient(135deg, #FEF3C7 0%, #D97706 100%)',
          chipBorder: '#FEF3C7',
          badgeBg: 'rgba(245, 158, 11, 0.2)',
          badgeBorder: '1px solid rgba(245, 158, 11, 0.65)',
          badgeColor: '#F59E0B',
          sheen: 'radial-gradient(circle, rgba(245, 158, 11, 0.25) 0%, transparent 70%)',
          stripColor: '#0B0905'
        };
      case 4:
        return {
          id: 'PLATINUM',
          displayName: 'PLATINUM ELITE',
          crownColor: '#38BDF8',
          accent: '#38BDF8',
          subAccent: '#BAE6FD',
          cardBg: 'linear-gradient(135deg, #0B132B 0%, #0E1A38 45%, #050B18 100%)',
          cardBorder: '2px solid rgba(56, 189, 248, 0.75)',
          glow: '0 25px 50px -10px rgba(14, 26, 56, 0.5), 0 0 35px rgba(56, 189, 248, 0.35)',
          chipBg: 'linear-gradient(135deg, #E0F2FE 0%, #0284C7 100%)',
          chipBorder: '#BAE6FD',
          badgeBg: 'rgba(56, 189, 248, 0.18)',
          badgeBorder: '1px solid rgba(56, 189, 248, 0.6)',
          badgeColor: '#38BDF8',
          sheen: 'radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, transparent 70%)',
          stripColor: '#050B18'
        };
      case 5:
        return {
          id: 'ADVANCE',
          displayName: 'ADVANCE PRESTIGE',
          crownColor: '#FDE68A',
          accent: '#FDE68A',
          subAccent: '#A855F7',
          cardBg: 'linear-gradient(135deg, #050505 0%, #161007 40%, #0C0814 100%)',
          cardBorder: '2px solid #F59E0B',
          glow: '0 30px 60px -10px rgba(0, 0, 0, 0.7), 0 0 45px rgba(245, 158, 11, 0.4), 0 0 25px rgba(168, 85, 247, 0.3)',
          chipBg: 'linear-gradient(135deg, #FDE68A 0%, #D97706 50%, #A855F7 100%)',
          chipBorder: '#FDE68A',
          badgeBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(168, 85, 247, 0.25))',
          badgeBorder: '1.5px solid #FDE68A',
          badgeColor: '#FDE68A',
          sheen: 'radial-gradient(circle, rgba(253, 230, 138, 0.3) 0%, transparent 70%)',
          stripColor: '#000000'
        };
      case 1:
      default:
        return {
          id: 'BASIC',
          displayName: 'BASIC MEMBER',
          crownColor: '#F59E0B',
          accent: '#F59E0B',
          subAccent: '#FEF3C7',
          cardBg: 'linear-gradient(135deg, #1A2B49 0%, #111D33 50%, #0B1424 100%)',
          cardBorder: '1.5px solid rgba(245, 158, 11, 0.45)',
          glow: '0 20px 45px -10px rgba(26, 43, 73, 0.45), 0 0 25px rgba(245, 158, 11, 0.18)',
          chipBg: 'linear-gradient(135deg, #FDE68A 0%, #D97706 100%)',
          chipBorder: '#FEF3C7',
          badgeBg: 'rgba(245, 158, 11, 0.16)',
          badgeBorder: '1px solid rgba(245, 158, 11, 0.5)',
          badgeColor: '#F59E0B',
          sheen: 'radial-gradient(circle, rgba(245, 158, 11, 0.2) 0%, transparent 70%)',
          stripColor: '#0B1424'
        };
    }
  };

  const theme = getTierTheme(currentLevel, currentTierName);

  // Auto-rotation loop
  useEffect(() => {
    if (!autoRotate || prefersReducedMotion.current) {
      if (autoRotateRafRef.current) cancelAnimationFrame(autoRotateRafRef.current);
      return;
    }

    let lastTime = performance.now();
    const animate = (time) => {
      const delta = time - lastTime;
      lastTime = time;
      setRotationY((prev) => (prev + delta * 0.05) % 360);
      autoRotateRafRef.current = requestAnimationFrame(animate);
    };

    autoRotateRafRef.current = requestAnimationFrame(animate);
    return () => {
      if (autoRotateRafRef.current) cancelAnimationFrame(autoRotateRafRef.current);
    };
  }, [autoRotate]);

  // Flip Toggle
  const handleToggleFlip = () => {
    setIsFlipped((prev) => {
      const next = !prev;
      setRotationY(next ? 180 : 0);
      setTiltX(0);
      if (onFlip) onFlip(next);
      return next;
    });
  };

  // 360° Quick Orbit Spin
  const handleFullOrbit = () => {
    setAutoRotate(false);
    setRotationY((prev) => prev + 360);
    setTiltX(0);
  };

  // Mouse & Touch Drag Handlers
  const handleDragStart = (clientX, clientY) => {
    if (prefersReducedMotion.current) return;
    setIsDragging(true);
    setAutoRotate(false);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      startRotY: rotationY,
      startTiltX: tiltX,
    };
  };

  const handleDragMove = useCallback((clientX, clientY) => {
    if (!isDragging || prefersReducedMotion.current) return;
    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;

    const newRotY = dragStartRef.current.startRotY + deltaX * 0.8;
    const newTiltX = Math.max(-25, Math.min(25, dragStartRef.current.startTiltX - deltaY * 0.4));

    setRotationY(newRotY);
    setTiltX(newTiltX);
  }, [isDragging]);

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    // Smoothly settle tilt back toward horizontal
    setTiltX(0);
  };

  // Attach global mouseup/touchend listeners during drag
  useEffect(() => {
    if (isDragging) {
      const onMouseMove = (e) => handleDragMove(e.clientX, e.clientY);
      const onTouchMove = (e) => {
        if (e.touches.length > 0) {
          handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      };
      const onEnd = () => handleDragEnd();

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onEnd);

      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onEnd);
        window.removeEventListener('touchcancel', onEnd);
      };
    }
  }, [isDragging, handleDragMove]);

  // Loading Skeleton State
  if (loading) {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          margin: '0 auto',
          aspectRatio: '1.586',
          minHeight: '235px',
          borderRadius: '22px',
          background: 'linear-gradient(135deg, #1A2B49 0%, #111D33 100%)',
          border: '1.5px solid rgba(245, 158, 11, 0.25)',
          padding: '1.4rem 1.6rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          animation: 'pulse 1.8s ease-in-out infinite',
          boxShadow: '0 15px 35px -8px rgba(26, 43, 73, 0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '110px', height: '24px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px' }} />
          <div style={{ width: '85px', height: '24px', background: 'rgba(255,255,255,0.1)', borderRadius: '999px' }} />
        </div>
        <div>
          <div style={{ width: '42px', height: '30px', background: 'rgba(255,255,255,0.12)', borderRadius: '6px', marginBottom: '0.75rem' }} />
          <div style={{ width: '160px', height: '32px', background: 'rgba(255,255,255,0.12)', borderRadius: '8px' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '130px', height: '18px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
          <div style={{ width: '70px', height: '18px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
        </div>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://zoor-up-9b3a3.web.app';
  const passUrl = `${origin}/customer/${encodeURIComponent(customerId)}`;
  const effectiveRotationY = rotationY;
  const isBackFacing = Math.abs(Math.round(effectiveRotationY / 180) % 2) === 1;

  // Render 10-stamp mini progress
  const stampDots = Array.from({ length: maxStamps }, (_, i) => i < stamps);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '460px',
        margin: '0 auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* 3D Perspective Viewport */}
      <div
        style={{
          perspective: '1400px',
          width: '100%',
        }}
      >
        <div
          ref={cardContainerRef}
          onMouseDown={(e) => {
            // Ignore drag if clicking inside buttons
            if (e.target.closest('button') || e.target.closest('a')) return;
            handleDragStart(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            if (e.touches.length > 0) {
              handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onDoubleClick={handleToggleFlip}
          tabIndex={0}
          role="button"
          aria-label={`3D Loyalty Card for ${customerName}. Level ${currentLevel} ${theme.displayName}. Points: ${points}. Drag left or right to rotate 360 degrees. Double tap or click to flip.`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleToggleFlip();
            }
          }}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1.586', // Standard credit/loyalty card aspect ratio
            minHeight: '235px',
            borderRadius: '22px',
            transformStyle: 'preserve-3d',
            transform: prefersReducedMotion.current
              ? (isFlipped ? 'rotateY(180deg)' : 'none')
              : `rotateX(${tiltX}deg) rotateY(${effectiveRotationY}deg)`,
            transition: isDragging
              ? 'none'
              : (isHovered && !autoRotate
                ? 'box-shadow 0.25s ease'
                : 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease'),
            cursor: isDragging ? 'grabbing' : 'grab',
            boxShadow: theme.glow,
            outline: 'none',
          }}
        >
          {/* =================================================================
              CARD FRONT (Z-Index 2 when facing front)
              ================================================================= */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              borderRadius: '22px',
              overflow: 'hidden',
              background: theme.cardBg,
              border: theme.cardBorder,
              padding: '1.35rem 1.55rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              color: '#FFFFFF',
              zIndex: isBackFacing ? 1 : 2,
            }}
          >
            {/* Metallic Sheen Texture & Radial Glow */}
            <div
              style={{
                position: 'absolute',
                top: '-40%',
                right: '-30%',
                width: '280px',
                height: '280px',
                background: theme.sheen,
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '-35%',
                left: '-25%',
                width: '240px',
                height: '240px',
                background: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            {/* Subtle Metallic Micro-Texture Grid */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.05,
                backgroundImage: 'radial-gradient(#FFFFFF 1px, transparent 1px)',
                backgroundSize: '16px 16px',
                pointerEvents: 'none',
              }}
            />

            {/* FRONT HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <ZoorUpLogo size="xs" width={32} height={32} priority />
                <div>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF', lineHeight: 1 }}>
                    ZOOR<span style={{ color: theme.accent }}>UP</span>
                  </span>
                  <span style={{ display: 'block', fontSize: '0.62rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginTop: '2px' }}>
                    VIP PASS • LEVEL {currentLevel}
                  </span>
                </div>
              </div>

              {/* Dynamic Tier Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: theme.badgeBg,
                  border: theme.badgeBorder,
                  padding: '4px 11px',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: theme.badgeColor,
                  letterSpacing: '0.05em',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}
              >
                <Crown size={13} color={theme.crownColor} />
                <span>{theme.displayName}</span>
              </div>
            </div>

            {/* FRONT CENTER: Chip, Balance & Stamp Progress */}
            <div style={{ position: 'relative', zIndex: 2, margin: 'auto 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  {/* Metallic Security Chip */}
                  <div
                    style={{
                      width: '38px',
                      height: '28px',
                      borderRadius: '6px',
                      background: theme.chipBg,
                      border: `1px solid ${theme.chipBorder}`,
                      boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 6px rgba(0,0,0,0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ width: '22px', height: '16px', border: '1px solid rgba(0,0,0,0.25)', borderRadius: '3px' }} />
                  </div>

                  {/* Contactless Wave Icon */}
                  <div style={{ opacity: 0.75, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ width: '10px', height: '10px', borderRight: `2px solid ${theme.accent}`, borderRadius: '50%' }} />
                    <div style={{ width: '16px', height: '16px', borderRight: `2px solid ${theme.accent}`, borderRadius: '50%', marginTop: '-8px' }} />
                  </div>
                </div>

                {/* Points Balance */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.65rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, display: 'block' }}>
                    Available Points
                  </span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: theme.accent, lineHeight: 1.1, letterSpacing: '-0.01em' }}>
                    {points.toLocaleString()} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.subAccent }}>PTS</span>
                  </div>
                </div>
              </div>

              {/* Mini Stamp Progress Bar (10 Visits / Stamps) */}
              <div
                style={{
                  marginTop: '0.85rem',
                  padding: '6px 10px',
                  background: 'rgba(0, 0, 0, 0.25)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '0.68rem', color: '#CBD5E1', fontWeight: 700 }}>
                    {stamps}/{maxStamps} VISITS
                  </span>
                </div>

                {/* 10 Visual Stamp Dots */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {stampDots.map((isFilled, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: isFilled ? theme.accent : 'rgba(255, 255, 255, 0.15)',
                        border: isFilled ? `1px solid ${theme.subAccent}` : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: isFilled ? `0 0 6px ${theme.accent}` : 'none',
                        transition: 'all 0.3s ease',
                      }}
                    />
                  ))}
                </div>

                {levelInfo?.nextTier && (
                  <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>
                    {levelInfo.pointsNeeded} pts to {levelInfo.nextTier.name}
                  </span>
                )}
              </div>
            </div>

            {/* FRONT FOOTER: Name & Card ID */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 2 }}>
              <div>
                <span style={{ fontSize: '0.62rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, display: 'block' }}>
                  Cardholder
                </span>
                <strong style={{ fontSize: '1.05rem', color: '#FFFFFF', letterSpacing: '0.02em', fontWeight: 800 }}>
                  {customerName}
                </strong>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.72rem', color: '#CBD5E1', letterSpacing: '0.05em' }}>
                  {customerId}
                </span>
              </div>
            </div>
          </div>

          {/* =================================================================
              CARD BACK (Rotated 180deg)
              ================================================================= */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              borderRadius: '22px',
              overflow: 'hidden',
              background: theme.cardBg,
              border: theme.cardBorder,
              padding: '1.2rem 1.45rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transform: 'rotateY(180deg)',
              color: '#FFFFFF',
              zIndex: isBackFacing ? 2 : 1,
            }}
          >
            {/* Magnetic Stripe */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: 0,
                right: 0,
                height: '36px',
                background: theme.stripColor,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            />

            {/* BACK CENTER: QR Code & Member Metrics */}
            <div style={{ marginTop: '46px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.1rem' }}>
              {/* Customer Real Scannable Pass QR */}
              <div
                style={{
                  background: '#FFFFFF',
                  padding: '7px',
                  borderRadius: '12px',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                  display: 'inline-flex',
                  flexShrink: 0,
                }}
              >
                <QRCodeSVG value={passUrl} size={92} level="M" />
              </div>

              {/* Member Details */}
              <div style={{ flex: 1, minWidth: 0, fontSize: '0.75rem' }}>
                <div style={{ fontSize: '0.62rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                  Customer Pass ID
                </div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem', fontWeight: 800, color: theme.accent, margin: '2px 0 6px' }}>
                  {customerId}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', fontSize: '0.7rem', color: '#CBD5E1', marginBottom: '6px' }}>
                  <div>
                    <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.6rem' }}>Member Since</span>
                    <strong>{joinedDate}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.6rem' }}>Total Visits</span>
                    <strong>{totalVisits}</strong>
                  </div>
                </div>

                <div style={{ fontSize: '0.65rem', color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>
                  SCAN • VISIT • EARN
                </div>
              </div>
            </div>

            {/* BACK FOOTER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', color: '#22C55E' }}>
                <ShieldCheck size={14} />
                <span>Verified Universal Member</span>
              </div>

              <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                Level {currentLevel} • {theme.displayName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 360° INTERACTIVE CONTROLS BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '1rem',
          padding: '0.5rem 0.75rem',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Flip Button */}
          <button
            type="button"
            onClick={handleToggleFlip}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#F8FAFC',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#1A2B49',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <RotateCcw size={13} color="#F59E0B" />
            <span>{isBackFacing ? 'View Front' : 'Flip to Back'}</span>
          </button>

          {/* 360° Orbit Button */}
          <button
            type="button"
            onClick={handleFullOrbit}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#F8FAFC',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#1A2B49',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Compass size={13} color="#F59E0B" />
            <span>360° Orbit</span>
          </button>
        </div>

        {/* Auto-Rotate Toggle */}
        <button
          type="button"
          onClick={() => setAutoRotate((prev) => !prev)}
          title="Toggle slow 3D auto-rotate"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 10px',
            borderRadius: '8px',
            border: autoRotate ? '1px solid #F59E0B' : '1px solid #E2E8F0',
            background: autoRotate ? '#FEF3C7' : '#FFFFFF',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: autoRotate ? '#B45309' : '#64748B',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {autoRotate ? <Pause size={12} /> : <Play size={12} />}
          <span>{autoRotate ? 'Auto Rotating' : 'Auto Rotate'}</span>
        </button>
      </div>

      {/* Touch & Drag Micro-Instruction */}
      <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#94A3B8', margin: '6px 0 0' }}>
        👆 Drag left or right to inspect 360° • Double tap to flip
      </p>
    </div>
  );
};

export default LoyaltyCard3D;
