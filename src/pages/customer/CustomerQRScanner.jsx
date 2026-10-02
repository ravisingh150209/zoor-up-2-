import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  ArrowLeft,
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Store,
  Award,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  Settings as SettingsIcon,
  HelpCircle,
  XCircle,
  WifiOff
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { qrService } from '../../services/qrService';
import { customerService } from '../../services/customerService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';

export const CustomerQRScanner = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const scannerRegionId = 'zoorup-customer-camera-viewport';
  const html5QrCodeRef = useRef(null);
  const isProcessingRef = useRef(false);
  const lastScannedCodeRef = useRef(null);

  // Scanner states:
  // 'requesting_permission' | 'scanning' | 'processing' | 'success' | 'checkin_prompt' | 'invalid_qr' | 'permission_denied' | 'error' | 'network_error'
  const [scannerState, setScannerState] = useState('requesting_permission');
  const [errorMessage, setErrorMessage] = useState('');
  const [technicalError, setTechnicalError] = useState('');
  const [resolvedData, setResolvedData] = useState(null);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState(null);
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);

  // Authentication & Customer Role Guard
  useEffect(() => {
    if (!user) {
      navigate('/login/customer', { replace: true });
    } else if (user.role !== 'customer') {
      addToast('Customer QR Scanner is only accessible to customers.', 'warning');
      navigate('/business', { replace: true });
    }
  }, [user, navigate, addToast]);

  // Clean stop for camera
  const stopCamera = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('[ZOOR UP CAMERA] Error cleaning up scanner instance:', err);
      }
      html5QrCodeRef.current = null;
    }
  }, []);

  // Safe camera initializer
  const startCamera = useCallback(async () => {
    // Reset flags
    isProcessingRef.current = false;
    setScannerState('requesting_permission');
    setErrorMessage('');
    setTechnicalError('');
    setShowSettingsHelp(false);

    try {
      // 1. Ensure previous instances are fully cleared
      await stopCamera();

      // 2. Ensure container is present in the DOM
      const targetElement = document.getElementById(scannerRegionId);
      if (!targetElement) {
        throw new Error(`Camera viewport container #${scannerRegionId} not found in DOM`);
      }

      // 3. Instantiate Html5Qrcode
      const html5QrCode = new Html5Qrcode(scannerRegionId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      html5QrCodeRef.current = html5QrCode;

      // 4. Configure scan parameters (ideal for mobile and desktop)
      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.75);
          return {
            width: Math.max(220, Math.min(320, qrboxSize)),
            height: Math.max(220, Math.min(320, qrboxSize)),
          };
        },
        aspectRatio: 1.0,
      };

      // 5. Start camera with environment (back) camera
      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          handleQRDetected(decodedText);
        },
        () => {
          // Continuous frame parsing pass; ignore non-detected frames
        }
      );

      setScannerState('scanning');
      console.log('[ZOOR UP CAMERA] Real camera scanner started successfully.');
    } catch (err) {
      console.error('[ZOOR UP CAMERA] Camera initialization failure:', err);
      const errStr = String(err).toLowerCase();
      const errName = err?.name || '';
      setTechnicalError(String(err?.message || err));

      const isPermissionDenied =
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errStr.includes('notallowed') ||
        errStr.includes('permission') ||
        errStr.includes('denied');

      if (isPermissionDenied) {
        setScannerState('permission_denied');
        setErrorMessage('Camera permission is required to scan a QR code.');
      } else {
        setScannerState('error');
        setErrorMessage('Camera could not be started.');
      }
    }
  }, [stopCamera]);

  // Lifecycle handling: Mount, Unmount, and App Background/Foreground
  useEffect(() => {
    // Start camera when component mounts
    startCamera();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[ZOOR UP CAMERA] App backgrounded — stopping camera stream safely.');
        stopCamera();
      } else {
        console.log('[ZOOR UP CAMERA] App foregrounded — resuming camera.');
        if (!isProcessingRef.current && scannerState !== 'success' && scannerState !== 'checkin_prompt') {
          startCamera();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // QR Detection Handler with Multi-Scan Prevention Lock
  const handleQRDetected = async (rawCode) => {
    // Multi-scan lock
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    lastScannedCodeRef.current = rawCode;

    // Immediately stop or pause camera scanning
    await stopCamera();
    setScannerState('processing');

    // Offline check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setScannerState('network_error');
      setErrorMessage('You appear to be offline. Please check your internet connection and retry.');
      return;
    }

    try {
      const result = await qrService.resolveQR(rawCode);

      if (!result.success) {
        if (result.isNetworkError) {
          setScannerState('network_error');
          setErrorMessage(result.error || 'Network error connecting to ZOOR UP servers. Please retry.');
          return;
        }
        setScannerState('invalid_qr');
        setErrorMessage(result.error || 'Invalid QR code. Please scan a ZOOR UP business QR code.');
        return;
      }

      setResolvedData(result);

      // Customer pass scanned
      if (result.type === 'customer' || result.type === 'CUSTOMER') {
        setScannerState('success');
        return;
      }

      // Connect customer to business multi-tenant connection safely
      if (result.business_id && user) {
        try {
          await qrService.connectBusiness(
            result.business_id,
            result.type || 'business',
            result.table_id || null
          );
        } catch (e) {
          console.warn('[ZOOR UP] Business connection warning:', e);
        }
      }

      // Asynchronously award loyalty stamp / record visit if logged in
      if (result.business_id && user) {
        try {
          const customerId = user.customer_id || user.id;
          customerService.recordVisit(result.business_id, customerId, {
            customer_name: user.name || 'Valued Customer',
            points: 50,
            stamps: 1,
          }).then((res) => {
            if (res && !res.alreadyCheckedInToday) {
              addToast(`STAMP EARNED! 🎉 +${res.stamps_awarded} Stamp & +${res.points_awarded} Points awarded!`, 'success');
            }
          }).catch(() => {});
        } catch (_) {}
      }

      const dest = result.destination || result.target_url || `/b/${result.business_slug || result.business_id}`;
      addToast(`Opening ${result.business_name || 'Business'}...`, 'success');
      navigate(dest);
    } catch (err) {
      console.error('[ZOOR UP CAMERA] QR resolution error:', err);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setScannerState('network_error');
        setErrorMessage('Network error occurred. Please check your internet connection and retry.');
      } else {
        setScannerState('invalid_qr');
        setErrorMessage('Could not process this QR code. Please try again.');
      }
    }
  };

  // Retry previous scan after network error
  const handleRetry = () => {
    if (lastScannedCodeRef.current) {
      isProcessingRef.current = false;
      handleQRDetected(lastScannedCodeRef.current);
    } else {
      handleScanAgain();
    }
  };

  // Confirm Check-In action
  const handleConfirmCheckIn = async () => {
    if (!resolvedData || !user) return;
    setCheckInSubmitting(true);
    try {
      const customerId = user.customer_id || user.id;
      const res = await customerService.recordVisit(resolvedData.business_id, customerId, {
        customer_name: user.name || 'Valued Customer',
        points: 50,
        stamps: 1,
      });
      setCheckInSuccess(res);
      setScannerState('success');
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    } catch (err) {
      addToast(err?.message || 'Check-in failed', 'error');
    } finally {
      setCheckInSubmitting(false);
    }
  };

  // Scan Again Action
  const handleScanAgain = () => {
    isProcessingRef.current = false;
    lastScannedCodeRef.current = null;
    setResolvedData(null);
    setCheckInSuccess(null);
    setErrorMessage('');
    setTechnicalError('');
    startCamera();
  };

  // Open Settings Guidance
  const handleOpenSettings = () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'camera' }).then((status) => {
          console.log('[ZOOR UP CAMERA] Permission query status:', status.state);
        }).catch(() => {});
      }
    } catch (e) {}

    setShowSettingsHelp(true);
    addToast('To enable camera: Tap browser/app lock or info icon in address bar, or open phone Settings > Apps > ZOOR UP > Permissions > Camera > Allow.', 'info');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: '85vh',
        width: '100%',
        maxWidth: '560px',
        margin: '0 auto',
        padding: '1rem',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
        }}
      >
        <button
          onClick={() => navigate('/customer')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            color: '#1A2B49',
            padding: '0.5rem 0.85rem',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
          Customer QR Scanner
        </h1>

        <div style={{ width: '60px' }} />
      </div>

      {/* Main Scanner Container: SaaS Off-White/Deep Navy Theme */}
      <div
        style={{
          width: '100%',
          background: '#FAFAFB',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(26, 43, 73, 0.08)',
          position: 'relative',
          padding: '1.5rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* =================================================================
            PERSISTENT CAMERA VIEWPORT CONTAINER
            Note: This element MUST remain in the DOM so Html5Qrcode always
            has a valid DOM node to attach to on mount and restart.
            ================================================================= */}
        <div
          style={{
            display: (scannerState === 'scanning' || scannerState === 'requesting_permission') ? 'flex' : 'none',
            width: '100%',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Top Instruction */}
          <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            <span
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#1A2B49',
                display: 'inline-block',
                background: '#FEF3C7',
                border: '1px solid #FDE68A',
                color: '#92400E',
                padding: '0.35rem 0.85rem',
                borderRadius: '8px',
              }}
            >
              QR code ko frame ke andar rakhein
            </span>
          </div>

          {/* Viewfinder Frame with Real Camera Video Preview */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '360px',
              borderRadius: '16px',
              overflow: 'hidden',
              background: '#0B0F19',
              border: '2px solid #CBD5E1',
              boxShadow: '0 8px 24px rgba(26, 43, 73, 0.15)',
              minHeight: '340px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Real HTML5 Camera Viewport */}
            <div
              id={scannerRegionId}
              style={{
                width: '100%',
                minHeight: '340px',
                background: '#0B0F19',
              }}
            />

            {/* Requesting Permission Overlay Spinner */}
            {scannerState === 'requesting_permission' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(11, 15, 25, 0.92)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1.5rem',
                  textAlign: 'center',
                  zIndex: 2,
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    border: '3px solid rgba(255, 255, 255, 0.2)',
                    borderTopColor: '#F59E0B',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '1rem',
                  }}
                />
                <p style={{ color: '#FFFFFF', fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
                  Starting Camera...
                </p>
                <p style={{ color: '#94A3B8', fontSize: '0.8rem', marginTop: '6px', maxWidth: '240px' }}>
                  Please allow camera access when prompted
                </p>
              </div>
            )}

            {/* Scanning Overlay Brackets & Laser */}
            {scannerState === 'scanning' && (
              <div
                style={{
                  position: 'absolute',
                  inset: '28px',
                  pointerEvents: 'none',
                  borderRadius: '16px',
                }}
              >
                {/* Top-Left Corner */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '32px',
                    height: '32px',
                    borderTop: '4px solid #F59E0B',
                    borderLeft: '4px solid #F59E0B',
                    borderTopLeftRadius: '10px',
                  }}
                />
                {/* Top-Right Corner */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '32px',
                    height: '32px',
                    borderTop: '4px solid #F59E0B',
                    borderRight: '4px solid #F59E0B',
                    borderTopRightRadius: '10px',
                  }}
                />
                {/* Bottom-Left Corner */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '32px',
                    height: '32px',
                    borderBottom: '4px solid #F59E0B',
                    borderLeft: '4px solid #F59E0B',
                    borderBottomLeftRadius: '10px',
                  }}
                />
                {/* Bottom-Right Corner */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: '32px',
                    height: '32px',
                    borderBottom: '4px solid #F59E0B',
                    borderRight: '4px solid #F59E0B',
                    borderBottomRightRadius: '10px',
                  }}
                />

                {/* Animated Laser Scanning Line */}
                <div
                  style={{
                    position: 'absolute',
                    left: '5%',
                    right: '5%',
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, #FDE68A, #F59E0B, #FDE68A, transparent)',
                    boxShadow: '0 0 12px #F59E0B',
                    animation: 'scannerSweep 2.2s ease-in-out infinite',
                  }}
                />
              </div>
            )}
          </div>

          {/* Bottom Instruction */}
          <div style={{ textAlign: 'center', marginTop: '0.85rem' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1A2B49', margin: 0 }}>
              QR code scan karein
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
              Supports store menu, loyalty stamps & check-in codes
            </p>
          </div>
        </div>

        {/* =================================================================
            STATE: PROCESSING SCAN
            ================================================================= */}
        {scannerState === 'processing' && (
          <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                border: '3px solid rgba(26, 43, 73, 0.15)',
                borderTopColor: '#1A2B49',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 1.25rem',
              }}
            />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1A2B49', margin: 0 }}>
              Opening business...
            </h3>
            <p style={{ color: '#64748B', fontSize: '0.85rem', marginTop: '6px' }}>
              Resolving verified ZOOR UP business data
            </p>
          </div>
        )}

        {/* =================================================================
            STATE: CHECK-IN PROMPT
            ================================================================= */}
        {scannerState === 'checkin_prompt' && resolvedData && (
          <div style={{ width: '100%', padding: '1rem 0.5rem', textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'rgba(26, 43, 73, 0.08)',
                color: '#1A2B49',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                border: '1px solid #CBD5E1',
              }}
            >
              <Store size={34} />
            </div>

            <Badge style={{ background: '#1A2B49', color: '#FFFFFF', marginBottom: '0.75rem' }}>
              ZOOR UP CHECK-IN
            </Badge>

            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.35rem' }}>
              {resolvedData.business_name}
            </h3>

            <p style={{ fontSize: '0.9rem', color: '#64748B', marginBottom: '1.5rem' }}>
              Check in at this business to collect loyalty points and stamps?
            </p>

            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '1rem',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-around',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Instant Reward</span>
                <strong style={{ fontSize: '1.2rem', color: '#D97706' }}>+50 Points</strong>
              </div>
              <div style={{ width: '1px', background: '#E2E8F0' }} />
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Loyalty Stamp</span>
                <strong style={{ fontSize: '1.2rem', color: '#1A2B49' }}>+1 Stamp</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={handleScanAgain} style={{ flex: 1 }}>
                Scan Again
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmCheckIn}
                loading={checkInSubmitting}
                style={{ flex: 1.5 }}
                icon={CheckCircle2}
              >
                Confirm Check In
              </Button>
            </div>
          </div>
        )}

        {/* =================================================================
            STATE: SUCCESS (MENU / LOYALTY / CUSTOMER)
            ================================================================= */}
        {scannerState === 'success' && resolvedData && (
          <div style={{ width: '100%', padding: '1rem 0.5rem', textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.12)',
                color: '#16A34A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                border: '1px solid #BBF7D0',
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            {resolvedData.type === 'MENU' && (
              <>
                <Badge style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', marginBottom: '0.5rem' }}>
                  DIGITAL STORE MENU
                </Badge>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.5rem' }}>
                  {resolvedData.business_name}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1.5rem' }}>
                  Browse fresh products, digital menu items, and place direct customer orders.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => navigate(resolvedData.target_url || `/m/${resolvedData.business_slug}`)}
                    icon={ExternalLink}
                  >
                    Open Store Menu
                  </Button>
                  <Button variant="secondary" fullWidth onClick={handleScanAgain} icon={RefreshCw}>
                    Scan Again
                  </Button>
                </div>
              </>
            )}

            {checkInSuccess && (
              <>
                {!checkInSuccess.alreadyCheckedInToday ? (
                  <>
                    <Badge style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', marginBottom: '0.5rem', fontWeight: 700, padding: '4px 12px' }}>
                      STAMP EARNED! 🎉
                    </Badge>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.35rem' }}>
                      {resolvedData.business_name || 'Store Check-in Verified'}
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1.25rem' }}>
                      Your visit has been confirmed and your digital loyalty pass is updated.
                    </p>

                    {/* Celebration badges for Level Up or Reward Unlock */}
                    {checkInSuccess.levelUp && (
                      <div
                        style={{
                          background: 'linear-gradient(135deg, #1A2B49 0%, #2A4365 100%)',
                          color: '#FFFFFF',
                          borderRadius: '12px',
                          padding: '0.85rem 1rem',
                          marginBottom: '1rem',
                          border: '1.5px solid #F59E0B',
                          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.25)',
                        }}
                      >
                        <div style={{ color: '#F59E0B', fontWeight: 800, fontSize: '0.95rem' }}>
                          LEVEL UP! 🎉
                        </div>
                        <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
                          Promoted to <strong>{checkInSuccess.levelUp.to}</strong> Tier!
                        </div>
                      </div>
                    )}

                    {checkInSuccess.rewardUnlocked && (
                      <div
                        style={{
                          background: '#ECFDF5',
                          color: '#065F46',
                          borderRadius: '12px',
                          padding: '0.85rem 1rem',
                          marginBottom: '1rem',
                          border: '1.5px solid #10B981',
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                          REWARD UNLOCKED 🎁
                        </div>
                        <div style={{ fontSize: '0.825rem', marginTop: '2px' }}>
                          {checkInSuccess.rewardUnlocked.title}
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '14px',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        border: '1.5px solid #E2E8F0',
                        display: 'flex',
                        justifyContent: 'space-around',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', fontWeight: 600 }}>Earned Stamp</span>
                        <strong style={{ fontSize: '1.25rem', color: '#1A2B49' }}>+1 Stamp ☕</strong>
                      </div>
                      <div style={{ width: '1px', background: '#E2E8F0' }} />
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', fontWeight: 600 }}>Earned Points</span>
                        <strong style={{ fontSize: '1.25rem', color: '#D97706' }}>+{checkInSuccess.points_awarded} Pts ★</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Badge style={{ background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD', marginBottom: '0.5rem', fontWeight: 700, padding: '4px 12px' }}>
                      VISIT RECORDED ✓
                    </Badge>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.35rem' }}>
                      {resolvedData.business_name}
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '1.25rem' }}>
                      You've already earned today's stamp at this store. Return tomorrow for your next stamp!
                    </p>
                  </>
                )}

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <Button variant="secondary" onClick={handleScanAgain} style={{ flex: 1 }} icon={RefreshCw}>
                    Scan Again
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => navigate(resolvedData.destination || resolvedData.target_url || `/menu/${resolvedData.business_slug || resolvedData.business_id}`)}
                    style={{ flex: 1.4, background: '#1A2B49', color: '#FFFFFF' }}
                    icon={ChevronRight}
                  >
                    View Digital Menu
                  </Button>
                </div>
              </>
            )}

            {!checkInSuccess && resolvedData.type === 'LOYALTY' && (
              <>
                <Badge style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', marginBottom: '0.5rem' }}>
                  LOYALTY & REWARDS
                </Badge>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.5rem' }}>
                  {resolvedData.business_name}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1.5rem' }}>
                  Earn stamps and reward points with every bill at this store.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => navigate('/customer')}
                    icon={Award}
                  >
                    View Loyalty Dashboard
                  </Button>
                  <Button variant="secondary" fullWidth onClick={handleScanAgain} icon={RefreshCw}>
                    Scan Again
                  </Button>
                </div>
              </>
            )}

            {resolvedData.type === 'CUSTOMER' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <ZoorUpLogo size="xs" width={24} height={24} priority />
                  <Badge variant="neutral">
                    UNIVERSAL CUSTOMER PASS
                  </Badge>
                </div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.35rem' }}>
                  {resolvedData.customer_name}
                </h3>
                <div style={{ fontFamily: 'var(--font-mono)', color: '#1A2B49', fontWeight: 700, marginBottom: '1.25rem' }}>
                  {resolvedData.customer_id}
                </div>
                <div
                  style={{
                    background: '#FFFFFF',
                    padding: '0.85rem',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    marginBottom: '1.5rem',
                    fontSize: '0.85rem',
                    color: '#64748B',
                  }}
                >
                  <ShieldCheck size={18} style={{ color: '#16A34A', verticalAlign: 'middle', marginRight: '6px' }} />
                  Verified ZoorUp Universal Customer Pass
                </div>
                <Button variant="secondary" fullWidth onClick={handleScanAgain} icon={RefreshCw}>
                  Scan Again
                </Button>
              </>
            )}
          </div>
        )}

        {/* =================================================================
            STATE: NETWORK ERROR
            ================================================================= */}
        {scannerState === 'network_error' && (
          <div style={{ width: '100%', padding: '1.75rem 1rem', textAlign: 'center' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                border: '1px solid #FDE68A',
              }}
            >
              <WifiOff size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.5rem' }}>
              Connection Error
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '1.5rem', maxWidth: '340px', margin: '0 auto 1.5rem' }}>
              {errorMessage || 'Unable to reach ZOOR UP servers. Please check your internet connection and try again.'}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '340px', margin: '0 auto' }}>
              <Button
                variant="primary"
                fullWidth
                onClick={handleRetry}
                icon={RefreshCw}
              >
                Retry
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={handleScanAgain}
              >
                Scan Again
              </Button>
            </div>
          </div>
        )}

        {/* =================================================================
            STATE: INVALID QR CODE
            ================================================================= */}
        {scannerState === 'invalid_qr' && (
          <div style={{ width: '100%', padding: '1.75rem 1rem', textAlign: 'center' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                border: '1px solid #FCA5A5',
              }}
            >
              <AlertTriangle size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.5rem' }}>
              Invalid QR Code
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '1.5rem', maxWidth: '340px', margin: '0 auto 1.5rem' }}>
              {errorMessage || 'This QR code is not recognized as a valid ZOOR UP code. Please scan a ZOOR UP business menu, check-in, or customer code.'}
            </p>

            <Button
              variant="primary"
              fullWidth
              onClick={handleScanAgain}
              icon={RefreshCw}
            >
              Scan Again
            </Button>
          </div>
        )}

        {/* =================================================================
            STATE: CAMERA PERMISSION DENIED
            ================================================================= */}
        {scannerState === 'permission_denied' && (
          <div style={{ width: '100%', padding: '1.75rem 1rem', textAlign: 'center' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                border: '1px solid #FDE68A',
              }}
            >
              <Camera size={32} />
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.5rem' }}>
              Camera Permission Required
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '1.5rem', lineHeight: 1.5, maxWidth: '360px', margin: '0 auto 1.5rem' }}>
              Camera permission is required to scan a QR code. ZOOR UP needs access to your camera to scan merchant QR codes, digital menus, and loyalty check-in cards.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              <Button
                variant="primary"
                onClick={startCamera}
                icon={RefreshCw}
              >
                Allow Camera Access
              </Button>

              <Button
                variant="secondary"
                onClick={handleOpenSettings}
                icon={SettingsIcon}
              >
                Open Settings
              </Button>
            </div>

            {showSettingsHelp && (
              <div
                style={{
                  marginTop: '1.25rem',
                  padding: '1rem',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '12px',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  color: '#475569',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, color: '#1A2B49', marginBottom: '4px' }}>
                  How to enable camera permissions:
                </div>
                <ul style={{ paddingLeft: '1.2rem', margin: '6px 0 0' }}>
                  <li><strong>In Mobile App / APK:</strong> Open Android Settings &gt; Apps &gt; ZOOR UP &gt; Permissions &gt; Camera &gt; Select "Allow".</li>
                  <li><strong>In Mobile Browser:</strong> Tap the lock or tune icon (🔒 / ⚙️) next to the website address &gt; Permissions &gt; Set Camera to "Allow", then tap "Allow Camera Access" above.</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* =================================================================
            STATE: CAMERA ERROR / COULD NOT BE STARTED
            ================================================================= */}
        {scannerState === 'error' && (
          <div style={{ width: '100%', padding: '1.75rem 1rem', textAlign: 'center' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                border: '1px solid #FCA5A5',
              }}
            >
              <XCircle size={32} />
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2B49', marginBottom: '0.5rem' }}>
              Camera could not be started.
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              {errorMessage || 'Unable to access camera on this device. Please verify your camera is not in use by another app.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              <Button
                variant="primary"
                onClick={startCamera}
                icon={RefreshCw}
              >
                Try Again
              </Button>

              <Button
                variant="secondary"
                onClick={handleOpenSettings}
                icon={SettingsIcon}
              >
                Open Settings
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Global CSS for QR Laser Sweep & Viewfinder Overrides */}
      <style>{`
        @keyframes scannerSweep {
          0% { top: 6%; opacity: 0.3; }
          50% { top: 92%; opacity: 1; }
          100% { top: 6%; opacity: 0.3; }
        }
        #zoorup-customer-camera-viewport video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 14px !important;
        }
        #zoorup-customer-camera-viewport {
          border: none !important;
        }
        #zoorup-customer-camera-viewport img {
          display: none !important;
        }
      `}</style>
    </div>
  );
};

export default CustomerQRScanner;
