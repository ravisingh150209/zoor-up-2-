import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  QrCode,
  Download,
  Printer,
  Copy,
  ExternalLink,
  Share2,
  Sparkles,
  Smartphone,
  Eye,
  RefreshCw,
  Store,
  UtensilsCrossed,
  Gift,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { QRGenerator } from '../../components/qr/QRGenerator';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { businessService } from '../../services/businessService';
import { tableBookingService } from '../../services/tableBookingService';
import { qrService } from '../../services/qrService';

export const QRMenuManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [storeSlug, setStoreSlug] = useState('');
  const [qrType, setQrType] = useState('business'); // 'business' | 'menu' | 'join' | 'checkin' | 'table'
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');

  const businessId = user?.business_id || user?.id;

  useEffect(() => {
    const loadData = async () => {
      if (businessId) {
        try {
          const biz = await businessService.getBusiness(businessId);
          if (biz) {
            setStoreSlug(biz.slug || biz.id);
          } else if (user.business_slug) {
            setStoreSlug(user.business_slug);
          }
        } catch (_) {
          if (user.business_slug) {
            setStoreSlug(user.business_slug);
          }
        }

        // Fetch tables for table-specific QR option
        try {
          const tableList = await tableBookingService.getTables(businessId);
          if (Array.isArray(tableList) && tableList.length > 0) {
            setTables(tableList);
            setSelectedTable(tableList[0]?.id || tableList[0]?.table_number || '');
          }
        } catch (_) {}
      } else if (user?.business_slug) {
        setStoreSlug(user.business_slug);
      }
    };
    loadData();
  }, [user, businessId]);

  const canonicalIdentifier = storeSlug || user?.business_slug || businessId || '';
  const currentQRUrl = qrService.generateStandardQRUrl(
    canonicalIdentifier,
    qrType,
    qrType === 'table' ? selectedTable : null
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(currentQRUrl);
    addToast('Standard QR URL copied to clipboard!', 'success');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${user?.business_name || 'Store'} on ZOOR UP`,
          text: `Scan our official ZOOR UP QR code:`,
          url: currentQRUrl,
        });
      } catch (e) {
        console.log(e);
      }
    } else {
      handleCopy();
    }
  };

  const getQRMeta = () => {
    switch (qrType) {
      case 'menu':
        return {
          title: 'Digital Menu QR Code',
          subtitle: 'Place on dining tables or counters for zero-contact digital catalog browsing',
        };
      case 'join':
        return {
          title: 'Loyalty & Rewards Pass QR',
          subtitle: 'Place at billing cash register for customers to sign up and claim points',
        };
      case 'checkin':
        return {
          title: 'Express Check-In QR',
          subtitle: 'Place at entrance or reception for automatic arrival visit records',
        };
      case 'table':
        return {
          title: `Table #${selectedTable || '1'} Dining QR`,
          subtitle: 'Customers scan this table sticker to browse menu pre-assigned to this table',
        };
      case 'business':
      default:
        return {
          title: 'Official Storefront Hub QR',
          subtitle: 'All-in-one entrance standee: opens digital menu, loyalty club, and booking',
        };
    }
  };

  const meta = getQRMeta();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Standardized QR System & Standees</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Generate high-resolution printable table standees, counter stickers, and storefront QR codes scannable by any mobile camera.
        </p>
      </div>

      {/* QR Type Selection Bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        background: 'var(--bg-surface-elevated, #F1F5F9)',
        padding: '0.4rem',
        borderRadius: 'var(--radius-lg, 14px)',
        border: '1px solid var(--border-color)'
      }}>
        {[
          { id: 'business', label: 'Storefront Hub', icon: Store, desc: '/b/{id}' },
          { id: 'menu', label: 'Digital Menu', icon: UtensilsCrossed, desc: '/b/{id}/menu' },
          { id: 'join', label: 'Loyalty Club', icon: Gift, desc: '/b/{id}/join' },
          { id: 'checkin', label: 'Check-In', icon: CheckCircle2, desc: '/b/{id}/checkin' },
          { id: 'table', label: 'Table Standee', icon: Calendar, desc: '/b/{id}/table/{tbl}' },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = qrType === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setQrType(tab.id)}
              style={{
                flex: '1 1 140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.6rem 0.85rem',
                borderRadius: 'var(--radius-md, 10px)',
                border: 'none',
                background: active ? '#1A2B49' : 'transparent',
                color: active ? '#FFFFFF' : 'var(--text-secondary)',
                fontWeight: active ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Table Selector if Table QR is chosen */}
      {qrType === 'table' && (
        <Card style={{ padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', border: '1px solid var(--primary-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Calendar size={18} color="var(--primary-color)" />
            <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Select Dining Table:</span>
          </div>
          {tables.length > 0 ? (
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              {tables.map((t) => (
                <option key={t.id} value={t.id || t.table_number}>
                  Table {t.table_number || t.name} ({t.capacity || 4} Guests - {t.location || 'Main'})
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              No custom tables configured. Using default Table #1.
            </span>
          )}
        </Card>
      )}

      <div className="grid-2">
        {/* Left: Standee Generator */}
        <QRGenerator
          value={currentQRUrl}
          title={meta.title}
          subtitle={meta.subtitle}
          businessName={user?.business_name || 'Store Partner'}
          size={220}
        />

        {/* Right: Feature Highlights & Standee Guidelines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Card>
            <CardHeader
              title="How Standard ZOOR UP QR Works"
              icon={Smartphone}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#1A2B49',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Works with Normal Phone Camera</strong>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                    iPhone Camera, Android Google Lens, Samsung Camera, or the ZOOR UP in-app scanner. No mandatory app download required to view your store.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#1A2B49',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Guaranteed Single-Business Isolation</strong>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Scanning this QR code strictly attaches the customer to <em>{user?.business_name || 'your store'}</em> only. No demo data, no customer leaks.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#1A2B49',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Automatic Loyalty Stamps & Pipeline</strong>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Customers earn points on visit and orders route live to your dashboard without manual data entry.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Live Standard HTTPS URL" icon={Share2} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div
                style={{
                  padding: '0.75rem',
                  background: 'var(--bg-input, #F8FAFC)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  color: 'var(--primary-color, #2563EB)',
                  wordBreak: 'break-all',
                }}
              >
                {currentQRUrl}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" icon={Copy} onClick={handleCopy}>
                  Copy URL
                </Button>
                <Button variant="secondary" size="sm" icon={Share2} onClick={handleShare}>
                  Share URL
                </Button>
                <a
                  href={currentQRUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    textDecoration: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.8rem'
                  }}
                >
                  <Eye size={14} />
                  <span>Preview Page</span>
                </a>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
