import React from 'react';
import zoorUpLogoImg from '../../assets/zoorup-logo.jpg';

/**
 * Official ZOOR UP Brand Logo Component
 * Single Source of Truth for ZOOR UP brand identity across the entire application.
 * Uses the official uploaded ZOOR UP logo image without modification or distortion.
 */
export const ZoorUpLogo = ({
  size = 'md',
  width,
  height,
  collapsed = false,
  className = '',
  style = {},
  alt = 'ZOOR UP',
  onClick,
  priority = false
}) => {
  // Pre-calculated sizing dimensions
  const sizeMap = {
    xs: { width: 28, height: 28 },
    sm: { width: 36, height: 36 },
    md: { width: 52, height: 52 },
    lg: { width: 76, height: 76 },
    xl: { width: 110, height: 110 },
    '2xl': { width: 140, height: 140 }
  };

  const currentSize = collapsed 
    ? sizeMap.sm 
    : (typeof size === 'string' && sizeMap[size] ? sizeMap[size] : sizeMap.md);

  const finalWidth = width || currentSize.width;
  const finalHeight = height || currentSize.height;

  return (
    <div
      className={`zoorup-logo-container ${className}`}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        lineHeight: 0,
        ...style
      }}
    >
      <img
        src={zoorUpLogoImg}
        alt={alt}
        width={finalWidth}
        height={finalHeight}
        loading={priority ? 'eager' : 'lazy'}
        style={{
          width: typeof finalWidth === 'number' ? `${finalWidth}px` : finalWidth,
          height: typeof finalHeight === 'number' ? `${finalHeight}px` : finalHeight,
          objectFit: 'contain',
          borderRadius: collapsed ? '8px' : '12px',
          display: 'block',
          transition: 'all 0.2s ease-in-out',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
          maxWidth: '100%'
        }}
      />
    </div>
  );
};

export default ZoorUpLogo;
