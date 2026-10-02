import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, RefreshCw, CheckCircle2, AlertCircle, X, ShieldAlert, ArrowRight, UserCheck } from 'lucide-react';
import { Button } from '../ui/Button';

export const QRScannerComponent = ({
  onScanSuccess,
  onClose,
  title = 'Scan ZoorUp QR Code',
  hint = 'Align the customer ID, table QR, or invoice code inside the viewfinder frame',
}) => {
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const scannerRef = useRef(null);
  const scanHandledRef = useRef(false);
  const scannerId = 'zoorup-html5-qrcode-region';

  useEffect(() => {
    let html5QrCode = null;

    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode(scannerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        // Prefer back camera on mobile devices
        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            // Successful QR detection
            handleScanSuccess(decodedText);
          },
          (errorMessage) => {
            // Frame parse pass - ignore continuous scan errors
          }
        );
        setIsScanning(true);
      } catch (err) {
        console.warn('Camera scanning error or permission denied:', err);
        setPermissionDenied(true);
        setErrorMsg('Unable to access camera. Please allow camera permissions or enter the code manually.');
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch((e) => console.log('Stop scan err', e));
      }
    };
  }, []);

  const handleScanSuccess = (text) => {
    if (scanHandledRef.current) return;
    scanHandledRef.current = true;
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.pause(true);
    }
    setScanResult(text);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleScanSuccess(manualInput.trim());
    }
  };

  const handleReset = () => {
    scanHandledRef.current = false;
    setScanResult(null);
    if (scannerRef.current) {
      try {
        scannerRef.current.resume();
      } catch (e) {
        console.log(e);
      }
    }
  };

  const handleConfirmAction = () => {
    if (onScanSuccess && scanResult) {
      onScanSuccess(scanResult);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: '500px',
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '1rem', width: '100%' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {title}
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {hint}
        </p>
      </div>

      {/* Result Card if scanned */}
      {scanResult ? (
        <div
          className="card animate-fade-in"
          style={{
            width: '100%',
            padding: '1.5rem',
            textAlign: 'center',
            border: '2px solid var(--primary-500)',
            background: 'var(--bg-surface-elevated)',
          }}
        >
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: 'var(--success-bg)',
              color: 'var(--accent-emerald)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
            }}
          >
            <CheckCircle2 size={32} />
          </div>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            QR Code Detected!
          </h4>
          <div
            style={{
              padding: '0.75rem',
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9rem',
              color: 'var(--primary-300)',
              wordBreak: 'break-all',
              marginBottom: '1.25rem',
            }}
          >
            {scanResult}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Button variant="secondary" onClick={handleReset} icon={RefreshCw}>
              Scan Again
            </Button>
            <Button variant="primary" onClick={handleConfirmAction} icon={ArrowRight}>
              Proceed with Result
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Viewport frame container */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
              background: '#000000',
              border: '2px solid var(--border-strong)',
              minHeight: '280px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div id={scannerId} style={{ width: '100%' }} />

            {permissionDenied && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1.5rem',
                  background: 'rgba(15, 23, 42, 0.95)',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                }}
              >
                <ShieldAlert size={40} className="text-amber-400 mb-2" />
                <p style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                  {errorMsg}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Tip: You can use the manual identifier input below to simulate scanning any customer ID (e.g. <code>ZUP-CUS-000001</code>) or order number!
                </p>
              </div>
            )}
          </div>

          {/* Manual Input Fallback */}
          <form
            onSubmit={handleManualSubmit}
            style={{
              width: '100%',
              marginTop: '1.25rem',
              display: 'flex',
              gap: '0.5rem',
            }}
          >
            <input
              type="text"
              className="form-input"
              placeholder="Or enter Customer ID / Code manually (e.g. ZUP-CUS-000001)"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
            />
            <Button type="submit" variant="secondary" style={{ flexShrink: 0 }}>
              Verify
            </Button>
          </form>

          {/* Quick Demo Customer shortcuts for immediate testing */}
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              width: '100%',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Quick Test Codes: </span>
            <button
              type="button"
              className="text-primary-400 hover:underline mx-1"
              onClick={() => handleScanSuccess('ZUP-CUS-000001')}
            >
              ZUP-CUS-000001
            </button>
            •
            <button
              type="button"
              className="text-primary-400 hover:underline mx-1"
              onClick={() => handleScanSuccess('https://zoorup.app/m/green-leaf-grocery')}
            >
              Store QR
            </button>
          </div>
        </>
      )}

      {onClose && (
        <div style={{ marginTop: '1.25rem' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close Scanner
          </Button>
        </div>
      )}
    </div>
  );
};
