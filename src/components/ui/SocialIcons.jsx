import React from 'react';

/**
 * Pixel-perfect SVG platform icons for ZOOR UP Social & Contact Links.
 * Replaces deprecated/missing Lucide brand icons with clean, scalable, accessible SVGs.
 */

export const InstagramIcon = ({ size = 20, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

export const FacebookIcon = ({ size = 20, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

export const WhatsAppIcon = ({ size = 20, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

export const YouTubeIcon = ({ size = 20, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill={color} />
  </svg>
);

export const LinkedInIcon = ({ size = 20, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

export const WebsiteIcon = ({ size = 20, color = 'currentColor', className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

/**
 * Sanitizes URLs to prevent unsafe schemes like javascript: or data:
 */
export const sanitizeUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return null;
  }
  return trimmed;
};

/**
 * Builds safe click-to-open target URL for each supported platform
 */
export const buildSocialUrl = (platform, value, whatsappMessage = '') => {
  const sanitized = sanitizeUrl(value);
  if (!sanitized) return null;

  switch (platform) {
    case 'instagram': {
      let clean = sanitized;
      if (clean.includes('instagram.com/')) {
        const parts = clean.split('instagram.com/');
        if (parts[1]) {
          clean = parts[1].split('/')[0].split('?')[0];
        }
      }
      if (clean.startsWith('@')) clean = clean.slice(1);
      clean = clean.replace(/[^a-zA-Z0-9._]/g, '');
      return clean ? `https://instagram.com/${clean}` : null;
    }

    case 'facebook': {
      let url = sanitized;
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }
      return url;
    }

    case 'whatsapp': {
      const digits = sanitized.replace(/[^0-9]/g, '');
      if (digits.length < 10) return null;
      const msg = whatsappMessage ? encodeURIComponent(whatsappMessage.trim()) : '';
      return `https://wa.me/${digits}${msg ? `?text=${msg}` : ''}`;
    }

    case 'website':
    case 'youtube':
    case 'linkedin': {
      let url = sanitized;
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }
      return url;
    }

    default:
      return /^https?:\/\//i.test(sanitized) ? sanitized : `https://${sanitized}`;
  }
};

/**
 * Reusable SocialLinksBar component for public business storefronts & customer hub
 */
export const SocialLinksBar = ({
  socialLinks = {},
  businessName = 'Store',
  size = 'md', // 'sm' | 'md' | 'lg'
  variant = 'pills', // 'pills' | 'icons' | 'colored'
  className = '',
  style = {},
}) => {
  if (!socialLinks || typeof socialLinks !== 'object') return null;

  const links = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: WhatsAppIcon,
      url: buildSocialUrl('whatsapp', socialLinks.whatsapp, socialLinks.whatsapp_message),
      brandColor: '#25D366',
      bgLight: '#DCFCE7',
      borderLight: '#86EFAC',
      title: `Chat with ${businessName} on WhatsApp`,
    },
    {
      id: 'instagram',
      label: 'Instagram',
      icon: InstagramIcon,
      url: buildSocialUrl('instagram', socialLinks.instagram),
      brandColor: '#E1306C',
      bgLight: '#FDF2F8',
      borderLight: '#FBCFE8',
      title: `Visit ${businessName} on Instagram`,
    },
    {
      id: 'facebook',
      label: 'Facebook',
      icon: FacebookIcon,
      url: buildSocialUrl('facebook', socialLinks.facebook),
      brandColor: '#1877F2',
      bgLight: '#EFF6FF',
      borderLight: '#BFDBFE',
      title: `Visit ${businessName} on Facebook`,
    },
    {
      id: 'website',
      label: 'Website',
      icon: WebsiteIcon,
      url: buildSocialUrl('website', socialLinks.website),
      brandColor: '#059669',
      bgLight: '#F0FDF4',
      borderLight: '#BBF7D0',
      title: `Visit ${businessName}'s official website`,
    },
    {
      id: 'youtube',
      label: 'YouTube',
      icon: YouTubeIcon,
      url: buildSocialUrl('youtube', socialLinks.youtube),
      brandColor: '#FF0000',
      bgLight: '#FEF2F2',
      borderLight: '#FECACA',
      title: `Watch ${businessName} on YouTube`,
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      icon: LinkedInIcon,
      url: buildSocialUrl('linkedin', socialLinks.linkedin),
      brandColor: '#0A66C2',
      bgLight: '#EFF6FF',
      borderLight: '#BFDBFE',
      title: `Connect with ${businessName} on LinkedIn`,
    },
  ].filter((item) => Boolean(item.url));

  if (links.length === 0) return null;

  const sizeStyles = {
    sm: { buttonSize: '32px', iconSize: 15, padding: '0.25rem 0.65rem', fontSize: '0.75rem' },
    md: { buttonSize: '38px', iconSize: 18, padding: '0.35rem 0.85rem', fontSize: '0.825rem' },
    lg: { buttonSize: '44px', iconSize: 22, padding: '0.5rem 1rem', fontSize: '0.9rem' },
  }[size] || { buttonSize: '38px', iconSize: 18, padding: '0.35rem 0.85rem', fontSize: '0.825rem' };

  return (
    <div
      className={`zoor-social-links-bar ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.55rem',
        ...style,
      }}
      aria-label={`${businessName} Social Media & Contact Links`}
    >
      {links.map((link) => {
        const IconComponent = link.icon;
        return (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={link.title}
            aria-label={link.title}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: variant === 'icons' ? sizeStyles.buttonSize : 'auto',
              height: sizeStyles.buttonSize,
              padding: variant === 'icons' ? 0 : sizeStyles.padding,
              gap: '0.45rem',
              borderRadius: variant === 'icons' ? '50%' : '999px',
              border: `1.5px solid ${variant === 'colored' ? link.borderLight : 'rgba(26, 43, 73, 0.12)'}`,
              background: variant === 'colored' ? link.bgLight : '#FFFFFF',
              color: variant === 'colored' ? link.brandColor : '#1A2B49',
              textDecoration: 'none',
              fontSize: sizeStyles.fontSize,
              fontWeight: 600,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${link.brandColor}33`;
              e.currentTarget.style.borderColor = link.brandColor;
              e.currentTarget.style.color = link.brandColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
              e.currentTarget.style.borderColor = variant === 'colored' ? link.borderLight : 'rgba(26, 43, 73, 0.12)';
              e.currentTarget.style.color = variant === 'colored' ? link.brandColor : '#1A2B49';
            }}
          >
            <IconComponent size={sizeStyles.iconSize} color={variant === 'colored' ? link.brandColor : 'currentColor'} />
            {variant !== 'icons' && <span>{link.label}</span>}
          </a>
        );
      })}
    </div>
  );
};
