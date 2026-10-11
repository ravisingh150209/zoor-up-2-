import React, { useState, useEffect } from 'react';

/**
 * ZOOR UP Premium Circular Avatar Component
 * - 100% circular (border-radius: 50% on container & image)
 * - overflow: hidden on container
 * - object-fit: cover, object-position: center (zero stretching or square corners)
 * - Elegant, thin border matching ZOOR UP navy & warm accent theme
 * - Graceful fallback to centered initials if image is missing or broken
 * - Subtle desktop hover micro-animation without mobile interference
 */
export const Avatar = ({
  src,
  alt = 'Profile Photo',
  name = '',
  size = 'md',
  className = '',
  showBorder = true,
  fallbackColor = 'accent',
  onClick,
  style = {},
}) => {
  const [imageError, setImageError] = useState(false);

  // Reset error state whenever image source changes
  useEffect(() => {
    setImageError(false);
  }, [src]);

  const sizeMap = {
    xs: { width: '28px', height: '28px', fontSize: '0.7rem', borderWidth: '1.5px' },
    sm: { width: '34px', height: '34px', fontSize: '0.78rem', borderWidth: '1.5px' },
    md: { width: '42px', height: '42px', fontSize: '0.9rem', borderWidth: '1.5px' },
    lg: { width: '56px', height: '56px', fontSize: '1.15rem', borderWidth: '2px' },
    xl: { width: '74px', height: '74px', fontSize: '1.4rem', borderWidth: '2px' },
    xxl: { width: '88px', height: '88px', fontSize: '1.75rem', borderWidth: '2px' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;
  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'ZU';

  const fallbackColors = {
    accent: {
      bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
      border: '#F59E0B',
      color: '#92400E',
    },
    primary: {
      bg: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
      border: '#3B82F6',
      color: '#1E40AF',
    },
    success: {
      bg: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
      border: '#10B981',
      color: '#065F46',
    },
    danger: {
      bg: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
      border: '#EF4444',
      color: '#991B1B',
    },
    neutral: {
      bg: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
      border: '#CBD5E1',
      color: '#475569',
    },
  };

  const fallback = fallbackColors[fallbackColor] || fallbackColors.accent;
  const hasValidImage = Boolean(src && typeof src === 'string' && src.trim() !== '' && !imageError);

  return (
    <div
      className={`zoor-avatar-circle ${className}`}
      onClick={onClick}
      style={{
        width: currentSize.width,
        height: currentSize.height,
        minWidth: currentSize.width,
        minHeight: currentSize.height,
        maxWidth: currentSize.width,
        maxHeight: currentSize.height,
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxSizing: 'border-box',
        border: showBorder
          ? `${currentSize.borderWidth} solid ${hasValidImage ? 'rgba(26, 43, 73, 0.15)' : fallback.border}`
          : 'none',
        background: hasValidImage ? '#FFFFFF' : fallback.bg,
        boxShadow: '0 2px 5px rgba(26, 43, 73, 0.08), 0 1px 2px rgba(26, 43, 73, 0.04)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.03)';
        e.currentTarget.style.boxShadow = '0 4px 10px rgba(26, 43, 73, 0.14), 0 2px 4px rgba(26, 43, 73, 0.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 2px 5px rgba(26, 43, 73, 0.08), 0 1px 2px rgba(26, 43, 73, 0.04)';
      }}
    >
      {hasValidImage ? (
        <img
          src={src.trim()}
          alt={alt || name || 'Profile'}
          onError={() => setImageError(true)}
          loading="lazy"
          decoding="async"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
            margin: 0,
            padding: 0,
            border: 'none',
          }}
        />
      ) : (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            fontSize: currentSize.fontSize,
            fontWeight: 700,
            color: fallback.color,
            lineHeight: 1,
            userSelect: 'none',
            letterSpacing: '0.02em',
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );
};

export default Avatar;
