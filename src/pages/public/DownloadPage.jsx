import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  Smartphone,
  Apple,
  Globe,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Layers,
  Zap,
  Info
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { Button } from '../../components/ui/Button';
import { PublicNavbar } from '../../components/layout/PublicNavbar';

export const DownloadPage = () => {
  const EAS_APK_DOWNLOAD_URL = 'https://expo.dev/artifacts/eas/lQX3ee822aY6c33x_chfzAIQrfCS3PLpSWZerl5Ydy0.apk';
  const [deviceType, setDeviceType] = useState('desktop'); // 'android', 'ios', 'desktop'
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [pwaModalOpen, setPwaModalOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(EAS_APK_DOWNLOAD_URL);

  const handleDownloadAndroidApk = () => {
    window.location.href = EAS_APK_DOWNLOAD_URL;
  };

  useEffect(() => {
    // 1. Device Detection
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    if (/android/i.test(ua)) {
      setDeviceType('android');
    } else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      setDeviceType('ios');
    } else {
      setDeviceType('desktop');
    }

    // 2. Default to authentic EAS release APK
    setDownloadUrl(EAS_APK_DOWNLOAD_URL);

    // 3. PWA install prompt listener
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsPwaInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      setPwaModalOpen(true);
    }
  };

  const currentDownloadLink = typeof window !== 'undefined'
    ? `${window.location.origin}/download`
    : 'https://zoor-up-9b3a3.web.app/download';

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFB', color: '#1A2B49', fontFamily: 'var(--font-sans)' }}>
      {/* Top Navigation */}
      <PublicNavbar />

      {/* Hero Section */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '3.5rem 1.25rem 5rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '780px', margin: '0 auto 3rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 1rem',
              borderRadius: '999px',
              background: '#FEF3C7',
              border: '1px solid #FDE68A',
              color: '#D97706',
              fontSize: '0.82rem',
              fontWeight: 600,
              marginBottom: '1.25rem',
            }}
          >
            <Sparkles size={14} /> Official ZOOR UP Multi-Platform Client &bull; v1.0.0
          </div>
          <h1
            style={{
              fontSize: 'clamp(2.2rem, 5vw, 3.4rem)',
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              marginBottom: '1.25rem',
              color: '#1A2B49',
            }}
          >
            GET ZOOR UP
          </h1>
          <p
            style={{
              fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
              color: '#475569',
              lineHeight: 1.6,
              fontWeight: 500,
              margin: '0 auto',
            }}
          >
            Run Your Business. Turn Customers Into Regulars.
          </p>
          <p style={{ fontSize: '0.9rem', color: '#64748B', marginTop: '0.5rem' }}>
            Available on Android, iPhone, iPad, and Modern Web (PWA). All platforms share the same real backend & verified data.
          </p>
        </div>

        {/* Primary Download Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.75rem',
            marginBottom: '3.5rem',
          }}
        >
          {/* Card 1: Android APK */}
          <div
            style={{
              background: '#FFFFFF',
              border: deviceType === 'android' ? '2px solid #F59E0B' : '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '2rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              boxShadow: deviceType === 'android' ? '0 8px 24px rgba(245, 158, 11, 0.15)' : 'var(--shadow-card)',
            }}
          >
            {deviceType === 'android' && (
              <div
                style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '16px',
                  background: '#F59E0B',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 12px',
                  borderRadius: '999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                }}
              >
                Recommended For You
              </div>
            )}
            <div>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  background: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  color: '#F59E0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                }}
              >
                <Smartphone size={28} />
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.5rem', color: '#1A2B49' }}>
                Android APK
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                Direct APK installer for Android phones and tablets. Instant access, camera barcode scanning, and push notifications.
              </p>
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Package: <code style={{ color: '#D97706' }}>com.zoorup.app</code></div>
                <div>Version: 1.0.0 (Signed Production Release)</div>
                <div>Size: 65.8 MB &bull; Architecture: arm64-v8a / universal</div>
                <div style={{ wordBreak: 'break-all', fontSize: '0.7rem' }}>SHA256: <code style={{ color: '#475569' }}>0A09C15EBF5AD934...C6CF8D44</code></div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleDownloadAndroidApk}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  width: '100%',
                  background: '#1A2B49',
                  color: '#FFFFFF',
                  padding: '0.85rem 1.25rem',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.2s, box-shadow 0.2s',
                  boxShadow: '0 2px 8px rgba(26, 43, 73, 0.2)',
                }}
              >
                <Download size={18} color="#F59E0B" />
                Download for Android (.APK)
              </button>
              <div style={{ textAlign: 'center', marginTop: '0.65rem', fontSize: '0.72rem', color: '#64748B' }}>
                Direct file download &bull; Verified safe package (com.zoorup.app)
              </div>
            </div>
          </div>

          {/* Card 2: iOS / TestFlight */}
          <div
            style={{
              background: '#FFFFFF',
              border: deviceType === 'ios' ? '2px solid #F59E0B' : '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '2rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              boxShadow: deviceType === 'ios' ? '0 4px 20px rgba(245, 158, 11, 0.15)' : 'var(--shadow-card)',
            }}
          >
            {deviceType === 'ios' && (
              <div
                style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '16px',
                  background: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  color: '#D97706',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Recommended For You
              </div>
            )}
            <div>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  background: '#FEF3C7',
                  color: '#F59E0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                  border: '1px solid #FDE68A',
                }}
              >
                <Apple size={28} />
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.5rem', color: '#1A2B49' }}>
                iOS / iPhone & iPad
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                Official iOS application available via Apple TestFlight beta and upcoming App Store release.
              </p>
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '1.5rem' }}>
                <div>Bundle ID: <code style={{ color: '#1A2B49', background: '#F8FAFC', padding: '1px 6px', borderRadius: '4px' }}>com.zoorup.app</code></div>
                <div style={{ marginTop: '0.25rem' }}>Status: Ready for TestFlight / App Store Connect</div>
              </div>
            </div>

            <div>
              <a
                href="https://testflight.apple.com/join/zoorup"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  width: '100%',
                  background: '#FFFFFF',
                  color: '#1A2B49',
                  padding: '0.85rem 1.25rem',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  textDecoration: 'none',
                  border: '1px solid #CBD5E1',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <ExternalLink size={18} />
                Download for iOS (TestFlight Beta)
              </a>
              <div style={{ textAlign: 'center', marginTop: '0.65rem', fontSize: '0.72rem', color: '#64748B' }}>
                Or use "Add to Home Screen" in Safari for PWA
              </div>
            </div>
          </div>

          {/* Card 3: Progressive Web App */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '2rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  background: '#FEF3C7',
                  color: '#F59E0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                  border: '1px solid #FDE68A',
                }}
              >
                <Globe size={28} />
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.5rem', color: '#1A2B49' }}>
                Installable Web App (PWA)
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                Install ZOOR UP directly to your home screen or desktop taskbar without visiting an app store. Works 100% offline.
              </p>
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '1.5rem' }}>
                <div>Support: Chrome, Safari, Edge, Samsung Internet</div>
                <div style={{ marginTop: '0.25rem' }}>Status: {isPwaInstalled ? 'Installed' : 'Ready to Install'}</div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleInstallPwa}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  width: '100%',
                  background: '#FFFFFF',
                  color: '#1A2B49',
                  padding: '0.85rem 1.25rem',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <Download size={18} />
                {isPwaInstalled ? 'Web App Already Installed' : 'Install ZOOR UP Web App'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '0.65rem', fontSize: '0.72rem', color: '#64748B' }}>
                Zero installation storage &bull; Always up to date
              </div>
            </div>
          </div>
        </div>

        {/* Desktop QR Code & Mobile Instructions */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '20px',
            padding: '2.5rem 2rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '2.5rem',
            marginBottom: '3.5rem',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ flex: '1 1 450px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#D97706', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
              <QrCode size={16} /> Scan with your phone camera
            </div>
            <h3 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.75rem', color: '#1A2B49' }}>
              Open ZOOR UP on Mobile Instantly
            </h3>
            <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Point your Android or iPhone camera at this QR code. It will open this download page directly on your phone so you can install the APK or add ZOOR UP to your home screen.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#475569', fontSize: '0.85rem' }}>
                <CheckCircle2 size={16} color="#22c55e" />
                <span>Single production backend with real database sync</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#475569', fontSize: '0.85rem' }}>
                <CheckCircle2 size={16} color="#22c55e" />
                <span>Real SMS OTP verification (no hardcoded passwords)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#475569', fontSize: '0.85rem' }}>
                <CheckCircle2 size={16} color="#22c55e" />
                <span>Zero fake demo data — clean start for every new business & customer</span>
              </div>
            </div>
          </div>

          <div
            style={{
              flex: '0 0 auto',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              padding: '1.25rem',
              borderRadius: '16px',
              textAlign: 'center',
              boxShadow: 'var(--shadow-card)',
              margin: '0 auto',
            }}
          >
            <QRCodeSVG
              value={currentDownloadLink}
              size={180}
              level="H"
              includeMargin={false}
            />
            <div style={{ color: '#1A2B49', fontWeight: 700, fontSize: '0.8rem', marginTop: '0.75rem' }}>
              scan to get ZOOR UP
            </div>
            <div style={{ color: '#64748B', fontSize: '0.7rem' }}>
              app.zoorup.com/download
            </div>
          </div>
        </div>

        {/* Step-by-Step Installation Guides */}
        <div style={{ marginBottom: '3.5rem' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '1.5rem', textAlign: 'center', color: '#1A2B49' }}>
            Installation Instructions
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {/* Guide 1: Android APK */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '1.5rem',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <h4 style={{ color: '#1A2B49', fontSize: '1rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                Android APK Install Flow
              </h4>
              <ol style={{ paddingLeft: '1.2rem', color: '#475569', fontSize: '0.85rem', lineHeight: 1.8 }}>
                <li>Tap <strong>Download for Android</strong> above.</li>
                <li>When the file finishes downloading, tap the notification or open your <strong>Downloads</strong> folder.</li>
                <li>Tap <code style={{ color: '#1A2B49', background: '#F8FAFC', padding: '1px 5px', borderRadius: '4px' }}>zoor-up-latest.apk</code>. If prompted, allow "Install unknown apps" for your browser.</li>
                <li>Tap <strong>Install</strong>, then open ZOOR UP.</li>
                <li>Sign in using your verified mobile number and real SMS OTP.</li>
              </ol>
            </div>

            {/* Guide 2: iOS Safari PWA */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '1.5rem',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <h4 style={{ color: '#1A2B49', fontSize: '1rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                iPhone / iPad Safari Flow
              </h4>
              <ol style={{ paddingLeft: '1.2rem', color: '#475569', fontSize: '0.85rem', lineHeight: 1.8 }}>
                <li>Open <strong>zoor-up-9b3a3.web.app</strong> in Safari.</li>
                <li>Tap the <strong>Share</strong> button (box with upward arrow ⎋) at the bottom toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen ⊞</strong>.</li>
                <li>Tap <strong>Add</strong> in the top-right corner.</li>
                <li>ZOOR UP is now installed as a full-screen app on your iOS home screen!</li>
              </ol>
            </div>

            {/* Guide 3: Android Chrome PWA */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '1.5rem',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <h4 style={{ color: '#1A2B49', fontSize: '1rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                Android Chrome PWA Flow
              </h4>
              <ol style={{ paddingLeft: '1.2rem', color: '#475569', fontSize: '0.85rem', lineHeight: 1.8 }}>
                <li>Open ZOOR UP in Chrome on your phone.</li>
                <li>Tap the three dots <strong>(⋮)</strong> menu in the top-right corner.</li>
                <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                <li>Confirm the prompt. ZOOR UP installs with offline capabilities.</li>
              </ol>
            </div>
          </div>
        </div>
      </main>

      {/* PWA Help Modal */}
      {pwaModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26, 43, 73, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            zIndex: 100,
          }}
          onClick={() => setPwaModalOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '2rem',
              color: '#1A2B49',
              boxShadow: '0 12px 32px rgba(26, 43, 73, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.75rem', color: '#1A2B49' }}>
              How to Install ZOOR UP Web App
            </h3>
            <p style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              Your browser does not support one-click automatic installation, but you can easily add ZOOR UP manually:
            </p>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', fontSize: '0.85rem', lineHeight: 1.7, color: '#475569' }}>
              <div><strong>On iPhone/Safari:</strong> Tap Share ⎋ &rarr; Add to Home Screen ⊞</div>
              <div style={{ marginTop: '0.5rem' }}><strong>On Android/Chrome:</strong> Tap Menu ⋮ &rarr; Install app</div>
              <div style={{ marginTop: '0.5rem' }}><strong>On Chrome/Edge Desktop:</strong> Look for the install icon ⊕ in the address bar</div>
            </div>
            <button
              type="button"
              onClick={() => setPwaModalOpen(false)}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: '#1A2B49',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(26, 43, 73, 0.2)',
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid #E2E8F0',
          background: '#FAFAFB',
          padding: '2rem 1.25rem',
          textAlign: 'center',
          color: '#64748B',
          fontSize: '0.82rem',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ color: '#1A2B49', fontWeight: 600 }}>ZOOR UP &bull; Run Your Business. Turn Customers Into Regulars.</div>
          <div>Package: com.zoorup.app &bull; Version 1.0.0 Production</div>
        </div>
      </footer>
    </div>
  );
};
