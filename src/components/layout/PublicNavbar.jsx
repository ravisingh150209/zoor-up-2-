import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Smartphone, QrCode, LogIn, Store, Menu, X, ArrowUpRight } from 'lucide-react';
import { ZoorUpLogo } from '../ui/ZoorUpLogo';
import '../../styles/navbar.css';

/**
 * ZOOR UP Public Navigation Bar
 * Features:
 * - Desktop: ZOOR UP Logo, [Download/App icon with tooltip], [QR Demo icon with tooltip], [Sign In button with icon], [Register Business CTA with icon]
 * - Mobile: [☰ Hamburger] [ZOOR UP Logo] [Sign In button]
 * - Accessible mobile slide-out drawer navigation
 * - Sleek glassmorphism, responsive breakpoints (320px to 1920px)
 */
export const PublicNavbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="zoorup-navbar" role="banner">
        <div className="zoorup-navbar-inner">
          {/* ===================================================
              DESKTOP VIEW (>= 769px)
              [ ZOOR UP LOGO ] ... [ Download icon ] [ QR icon ] [ Sign In ] [ Register Business ]
             =================================================== */}
          <Link
            to="/"
            className="navbar-brand-link hide-on-mobile"
            aria-label="ZOOR UP Home"
            title="ZOOR UP Home"
          >
            <ZoorUpLogo size="sm" width={42} height={42} priority />
            <div className="navbar-brand-text">
              <span className="navbar-brand-title">
                ZOOR<span className="navbar-brand-accent">UP</span>
              </span>
            </div>
          </Link>

          <nav className="navbar-desktop-actions" aria-label="Main Navigation">
            {/* 1. GET APP ICON */}
            <div className="navbar-icon-tooltip-wrapper">
              <Link
                to="/download"
                className="navbar-icon-btn"
                aria-label="Get App"
                title="Get App"
              >
                <Smartphone size={21} aria-hidden="true" />
              </Link>
              <div className="navbar-tooltip" role="tooltip" id="tooltip-get-app">
                Get App
              </div>
            </div>

            {/* 2. LIVE QR DEMO ICON */}
            <div className="navbar-icon-tooltip-wrapper">
              <Link
                to="/m/green-leaf-grocery"
                target="_blank"
                rel="noopener noreferrer"
                className="navbar-icon-btn"
                aria-label="Live QR Demo"
                title="Live QR Demo"
              >
                <QrCode size={21} aria-hidden="true" />
              </Link>
              <div className="navbar-tooltip" role="tooltip" id="tooltip-qr-demo">
                Live QR Demo
              </div>
            </div>

            {/* 3. SIGN IN BUTTON */}
            <Link
              to="/login"
              className="navbar-btn-signin"
              aria-label="Sign In"
              title="Sign In to ZOOR UP"
            >
              <LogIn size={16} aria-hidden="true" />
              <span>Sign In</span>
            </Link>

            {/* 4. REGISTER BUSINESS CTA */}
            <Link
              to="/signup/business"
              className="navbar-btn-cta"
              aria-label="Register Business"
              title="Register Your Business"
            >
              <Store size={16} aria-hidden="true" />
              <span>Register Business</span>
            </Link>
          </nav>

          {/* ===================================================
              MOBILE HEADER (<= 768px)
              [☰] [ZOOR UP LOGO] [Sign In]
             =================================================== */}
          <div className="navbar-mobile-header">
            {/* Left: Hamburger & Brand Logo */}
            <div className="navbar-mobile-left">
              <button
                type="button"
                className="navbar-hamburger-btn"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation-drawer"
              >
                <Menu size={22} />
              </button>

              <Link
                to="/"
                className="navbar-brand-link"
                aria-label="ZOOR UP Home"
              >
                <ZoorUpLogo size="xs" width={32} height={32} priority />
                <span className="navbar-brand-title" style={{ fontSize: '1.2rem' }}>
                  ZOOR<span className="navbar-brand-accent">UP</span>
                </span>
              </Link>
            </div>

            {/* Right: Sign In Button */}
            <Link
              to="/login"
              className="navbar-mobile-signin"
              aria-label="Sign In"
            >
              <LogIn size={14} aria-hidden="true" />
              <span>Sign In</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ===================================================
          MOBILE NAVIGATION DRAWER & OVERLAY
         =================================================== */}
      <div
        className={`navbar-mobile-overlay ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden={!mobileMenuOpen}
      />

      <aside
        id="mobile-navigation-drawer"
        className={`navbar-mobile-drawer ${mobileMenuOpen ? 'open' : ''}`}
        aria-label="Mobile Navigation"
        aria-hidden={!mobileMenuOpen}
      >
        <div className="navbar-drawer-header">
          <Link
            to="/"
            className="navbar-brand-link"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="ZOOR UP Home"
          >
            <ZoorUpLogo size="xs" width={32} height={32} />
            <span className="navbar-brand-title" style={{ fontSize: '1.15rem' }}>
              ZOOR<span className="navbar-brand-accent">UP</span>
            </span>
          </Link>
          <button
            type="button"
            className="navbar-drawer-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="navbar-drawer-nav">
          {/* Download App Item */}
          <Link
            to="/download"
            className="navbar-drawer-item"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="navbar-drawer-icon-wrap">
              <Smartphone size={22} />
            </div>
            <div>
              <div className="navbar-drawer-item-title">Get App</div>
              <div className="navbar-drawer-item-sub">Download for Android & iOS</div>
            </div>
          </Link>

          {/* Live QR Demo Item */}
          <Link
            to="/m/green-leaf-grocery"
            target="_blank"
            rel="noopener noreferrer"
            className="navbar-drawer-item"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="navbar-drawer-icon-wrap">
              <QrCode size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="navbar-drawer-item-title">Live QR Demo</span>
                <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
              <div className="navbar-drawer-item-sub">Test real customer menu & cart</div>
            </div>
          </Link>

          {/* Sign In Item */}
          <Link
            to="/login"
            className="navbar-drawer-item"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="navbar-drawer-icon-wrap">
              <LogIn size={20} />
            </div>
            <div>
              <div className="navbar-drawer-item-title">Sign In</div>
              <div className="navbar-drawer-item-sub">Access your store dashboard</div>
            </div>
          </Link>

          {/* Register Business Highlighted CTA */}
          <Link
            to="/signup/business"
            className="navbar-drawer-item highlight-cta"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="navbar-drawer-icon-wrap">
              <Store size={20} />
            </div>
            <div>
              <div className="navbar-drawer-item-title" style={{ color: '#ffffff' }}>
                Register Business
              </div>
              <div className="navbar-drawer-item-sub" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Start 30-day free trial
              </div>
            </div>
          </Link>
        </nav>

        <div className="navbar-drawer-footer">
          <p style={{ margin: 0 }}>Smart Business. Simple Management.</p>
          <p style={{ margin: '4px 0 0', opacity: 0.6 }}>ZOOR UP &copy; {new Date().getFullYear()}</p>
        </div>
      </aside>
    </>
  );
};

export default PublicNavbar;
