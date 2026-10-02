import React, { useRef } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Download, Printer, Copy, Check, ExternalLink, QrCode } from 'lucide-react';
import { Button } from '../ui/Button';
import { ZoorUpLogo } from '../ui/ZoorUpLogo';
import { useToast } from '../../context/ToastContext';

export const QRGenerator = ({
  value,
  title = 'ZoorUp Digital QR',
  subtitle = 'Scan with any smartphone camera to view digital menu & place orders',
  businessName = 'Store Partner',
  size = 220,
}) => {
  const { addToast } = useToast();

  const handleDownloadPng = () => {
    try {
      const canvas = document.getElementById('zoorup-qr-canvas');
      if (!canvas) return;
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `zoorup-qr-${Date.now()}.png`;
      a.href = url;
      a.click();
      addToast('High-resolution PNG QR downloaded!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Failed to download QR image', 'error');
    }
  };

  const handleDownloadSvg = () => {
    try {
      const svgElement = document.getElementById('zoorup-qr-svg');
      if (!svgElement) return;
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const a = document.createElement('a');
      a.download = `zoorup-qr-${Date.now()}.svg`;
      a.href = svgUrl;
      a.click();
      URL.revokeObjectURL(svgUrl);
      addToast('Printable SVG vector QR downloaded!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Failed to download SVG', 'error');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(value);
    addToast('Standard QR link copied to clipboard!', 'success');
  };

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '1.5rem 1rem',
        width: '100%',
        maxWidth: 'min(94vw, 440px)',
        margin: '0 auto',
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: 'var(--bg-surface, #FFFFFF)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg, 16px)'
      }}
    >
      <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <ZoorUpLogo size="sm" width={38} height={38} style={{ marginBottom: '0.65rem' }} priority />
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          {title}
        </h3>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '340px' }}>
          {subtitle}
        </p>
      </div>

      {/* QR Display frame with High Contrast & Quiet Zone */}
      <div
        style={{
          background: '#ffffff',
          padding: '1rem',
          borderRadius: 'var(--radius-xl, 18px)',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
          border: '4px solid var(--primary-color, #1A2B49)',
          position: 'relative',
          marginBottom: '1.25rem',
          width: '100%',
          maxWidth: 'min(78vw, 260px)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <QRCodeCanvas
            id="zoorup-qr-canvas"
            value={value}
            size={size}
            level="H"
            includeMargin={true}
            style={{
              maxWidth: '100%',
              height: 'auto',
              aspectRatio: '1 / 1',
              display: 'block',
            }}
          />
          {/* Hidden SVG for vector download */}
          <div style={{ display: 'none' }}>
            <QRCodeSVG
              id="zoorup-qr-svg"
              value={value}
              size={512}
              level="H"
              includeMargin={true}
            />
          </div>
        </div>
        <div
          style={{
            marginTop: '10px',
            fontSize: '0.78rem',
            fontWeight: 800,
            color: '#1e293b',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            textAlign: 'center',
            wordBreak: 'break-word',
          }}
        >
          {businessName}
        </div>
        <span style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
          Scan with any camera app
        </span>
      </div>

      {/* Quick link display */}
      <div
        style={{
          width: '100%',
          background: 'var(--bg-input, #F1F5F9)',
          border: '1px solid var(--border-color, #CBD5E1)',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '0.55rem 0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          fontSize: '0.8rem',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            color: 'var(--primary-color, #2563EB)',
            fontFamily: 'monospace',
            fontSize: '0.78rem',
            marginRight: '0.5rem',
          }}
        >
          {value}
        </span>
        <button
          onClick={handleCopyLink}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          title="Copy Link"
        >
          <Copy size={15} color="var(--text-secondary)" />
        </button>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.5rem',
          width: '100%',
        }}
      >
        <Button variant="primary" size="sm" icon={Download} onClick={handleDownloadPng}>
          Download PNG
        </Button>
        <Button variant="secondary" size="sm" icon={Download} onClick={handleDownloadSvg}>
          Download SVG
        </Button>
        <Button variant="outline" size="sm" icon={Printer} onClick={handlePrint}>
          Print Standee
        </Button>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline btn-sm"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
            textDecoration: 'none',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border-color)',
            fontSize: '0.8rem',
            fontWeight: 600
          }}
        >
          <ExternalLink size={14} />
          <span>Open Live</span>
        </a>
      </div>
    </div>
  );
};
