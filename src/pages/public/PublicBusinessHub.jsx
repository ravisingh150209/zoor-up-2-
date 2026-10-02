import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Store,
  UtensilsCrossed,
  Gift,
  CheckCircle2,
  Calendar,
  MapPin,
  Phone,
  Clock,
  Sparkles,
  Smartphone,
  ExternalLink,
  ChevronRight,
  Share2,
  Award,
  ShieldCheck,
  Check,
  QrCode
} from 'lucide-react';
import { qrService } from '../../services/qrService';
import { businessService } from '../../services/businessService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/States';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { PublicQRMenu } from './PublicQRMenu';

export const PublicBusinessHub = () => {
  const { businessId, type, tableId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState(null);
  const [catalogData, setCatalogData] = useState(null);
  const [activeTab, setActiveTab] = useState(type || 'overview'); // 'overview' | 'menu' | 'join' | 'checkin' | 'table'
  const [connected, setConnected] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInDone, setCheckInDone] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const resolvedIdentifier = businessId || '';

  // Synchronize active tab with URL parameter if present
  useEffect(() => {
    if (type) {
      setActiveTab(type);
    }
  }, [type]);

  // Load public business data
  useEffect(() => {
    let isMounted = true;
    const loadBusiness = async () => {
      setLoading(true);
      try {
        // Fetch via public API endpoint
        const res = await qrService.getPublicBusinessHub(resolvedIdentifier);
        if (res && res.business && isMounted) {
          setBusiness(res.business);
          setCatalogData(res);
        } else {
          // Fallback to businessService
          const biz = await businessService.getBusiness(resolvedIdentifier);
          if (biz && isMounted) {
            setBusiness(biz);
          }
        }
      } catch (e) {
        console.warn('[PUBLIC HUB] Error loading business data:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (resolvedIdentifier) {
      loadBusiness();
    }
    return () => { isMounted = false; };
  }, [resolvedIdentifier]);

  // If customer is logged in, automatically connect them to this business
  useEffect(() => {
    if (user && user.role === 'customer' && business?.id) {
      qrService.connectBusiness(business.id, activeTab, tableId).then((res) => {
        if (res && res.success) {
          setConnected(true);
        }
      }).catch(() => {});
    }
  }, [user, business?.id, activeTab, tableId]);

  const handleManualCheckIn = async () => {
    if (!user) {
      addToast('Please log in or create an account to check in and earn loyalty stamps.', 'info');
      navigate(`/login/customer?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }

    setCheckingIn(true);
    try {
      const res = await qrService.connectBusiness(business.id, 'checkin', tableId);
      if (res && res.success) {
        setCheckInDone(true);
        if (res.already_checked_in) {
          addToast('You are already checked in for today!', 'info');
        } else {
          addToast('Check-in confirmed! 🎉 +50 Points & +1 Stamp awarded!', 'success');
        }
      } else {
        addToast(res.error || 'Check-in failed', 'error');
      }
    } catch (e) {
      addToast('Could not complete check-in', 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: business?.name || 'ZOOR UP Partner',
        text: `Visit ${business?.name || 'this store'} on ZOOR UP:`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
      setCopiedLink(true);
      addToast('Store link copied to clipboard!', 'info');
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (loading) {
    return <LoadingState message="Connecting to business..." />;
  }

  if (!business) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <ZoorUpLogo size="md" priority style={{ marginBottom: '1.5rem' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Business Not Found</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '380px', marginTop: '0.5rem' }}>
          This QR code or link is invalid or the business is currently unavailable.
        </p>
        <Button variant="primary" onClick={() => navigate('/')} style={{ marginTop: '1.5rem' }}>
          Go to ZOOR UP Home
        </Button>
      </div>
    );
  }

  // If tab is purely 'menu', render the full digital menu directly
  if (activeTab === 'menu' && catalogData) {
    return <PublicQRMenu />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main, #F8FAFC)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Mobile App Open Banner */}
      <div style={{
        background: '#1A2B49',
        color: '#FFFFFF',
        padding: '0.6rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.82rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ZoorUpLogo size="xs" priority />
          <span>Experience faster in the <strong>ZOOR UP App</strong></span>
        </div>
        <a
          href={`zoorup://b/${business.slug || business.id}`}
          style={{
            background: 'var(--primary-color, #2563EB)',
            color: '#FFFFFF',
            padding: '0.3rem 0.75rem',
            borderRadius: '999px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.78rem'
          }}
        >
          Open App
        </a>
      </div>

      {/* Hero Banner with Cover Photo */}
      <div style={{
        position: 'relative',
        height: '180px',
        background: business.cover_image
          ? `url(${business.cover_image}) center/cover no-repeat`
          : 'linear-gradient(135deg, #1A2B49 0%, #2563EB 100%)',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)',
        }} />
      </div>

      {/* Main Container */}
      <div style={{ maxWidth: '640px', width: '100%', margin: '0 auto', padding: '0 1rem 3rem 1rem', flex: 1, marginTop: '-50px', position: 'relative', zIndex: 10 }}>
        {/* Business Header Card */}
        <Card style={{ padding: '1.25rem', border: '1px solid var(--border-color)', boxShadow: '0 10px 25px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{
              width: '74px',
              height: '74px',
              borderRadius: '16px',
              border: '3px solid #FFFFFF',
              background: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              overflow: 'hidden',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {business.logo ? (
                <img src={business.logo} alt={business.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Store size={36} color="#1A2B49" />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {business.name}
                </h1>
                <Badge variant="success" style={{ fontSize: '0.72rem' }}>Verified Partner</Badge>
              </div>

              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
                {business.category || 'Dining & Retail'} • {business.city || 'Mumbai'}
              </p>

              {tableId && (
                <div style={{ marginTop: '0.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.55rem', background: '#EFF6FF', borderRadius: '6px', fontSize: '0.75rem', color: '#1D4ED8', fontWeight: 700 }}>
                  <UtensilsCrossed size={12} /> Table #{tableId}
                </div>
              )}
            </div>

            <button
              onClick={handleShare}
              style={{ background: 'var(--bg-surface-elevated, #F1F5F9)', border: 'none', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="Share Store"
            >
              <Share2 size={16} color="var(--text-primary)" />
            </button>
          </div>

          {/* Business Meta details */}
          <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {business.address && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={14} style={{ flexShrink: 0 }} />
                <span>{business.address}</span>
              </div>
            )}
            {business.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Phone size={14} style={{ flexShrink: 0 }} />
                <a href={`tel:${business.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{business.phone}</a>
              </div>
            )}
          </div>
        </Card>

        {/* Action Navigation Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', margin: '1rem 0' }}>
          {[
            { id: 'overview', label: 'Overview', icon: Store },
            { id: 'menu', label: 'Digital Menu', icon: UtensilsCrossed },
            { id: 'join', label: 'Loyalty', icon: Gift },
            { id: 'table', label: 'Book Table', icon: Calendar },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'menu') {
                    navigate(`/menu/${business.slug || business.id}`);
                  } else {
                    setActiveTab(tab.id);
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.65rem 0.25rem',
                  borderRadius: '12px',
                  border: active ? '2px solid var(--primary-color, #2563EB)' : '1px solid var(--border-color)',
                  background: active ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface, #FFFFFF)',
                  color: active ? 'var(--primary-color, #2563EB)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: active ? 700 : 500,
                  fontSize: '0.78rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: OVERVIEW & QUICK ACTIONS */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Quick Check-in Banner */}
            <Card style={{ padding: '1.25rem', background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1E293B', fontWeight: 800, fontSize: '1rem' }}>
                    <Sparkles size={18} color="#2563EB" />
                    <span>In-Store Check-In</span>
                  </div>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                    Tap to check in, record your visit, and earn points towards rewards!
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  loading={checkingIn}
                  onClick={handleManualCheckIn}
                  icon={checkInDone ? CheckCircle2 : Sparkles}
                >
                  {checkInDone ? 'Checked In' : 'Check In'}
                </Button>
              </div>
            </Card>

            {/* Action Cards */}
            <Card style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div
                onClick={() => navigate(`/menu/${business.slug || business.id}${tableId ? `?table=${tableId}` : ''}`)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '10px', background: 'var(--bg-surface-elevated, #F8FAFC)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UtensilsCrossed size={18} color="#2563EB" />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.9rem', display: 'block' }}>Browse Digital Menu</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Zero-contact menu with instant order selection</span>
                  </div>
                </div>
                <ChevronRight size={18} color="var(--text-secondary)" />
              </div>

              <div
                onClick={() => setActiveTab('join')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '10px', background: 'var(--bg-surface-elevated, #F8FAFC)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Gift size={18} color="#10B981" />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.9rem', display: 'block' }}>Loyalty & Rewards Program</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Earn digital stamps & claim discount rewards</span>
                  </div>
                </div>
                <ChevronRight size={18} color="var(--text-secondary)" />
              </div>

              <div
                onClick={() => navigate(`/customer/table-booking?business_id=${business.id}`)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '10px', background: 'var(--bg-surface-elevated, #F8FAFC)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Calendar size={18} color="#D97706" />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.9rem', display: 'block' }}>Reserve Dining Table</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Instant table confirmation with no waiting</span>
                  </div>
                </div>
                <ChevronRight size={18} color="var(--text-secondary)" />
              </div>
            </Card>
          </div>
        )}

        {/* Tab 2: LOYALTY & REWARDS PROGRAM */}
        {activeTab === 'join' && (
          <Card style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(37, 99, 235, 0.1)', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto' }}>
                <Gift size={28} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                {business.name} Loyalty Club
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                Turn your everyday visits into free gifts, discounts, and VIP membership perks.
              </p>
            </div>

            {/* Program highlights */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-surface-elevated, #F8FAFC)', padding: '1rem', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                <CheckCircle2 size={16} color="#10B981" />
                <span>Earn <strong>50 Loyalty Points</strong> on every visit</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                <CheckCircle2 size={16} color="#10B981" />
                <span>Collect <strong>Digital Stamps</strong> on food & service orders</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                <CheckCircle2 size={16} color="#10B981" />
                <span>Exclusive member vouchers & birthday rewards</span>
              </div>
            </div>

            {user && user.role === 'customer' ? (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Badge variant="success" style={{ padding: '0.4rem 1rem', alignSelf: 'center' }}>
                  Connected as {user.name}
                </Badge>
                <Button
                  variant="primary"
                  block
                  onClick={() => navigate('/customer/loyalty')}
                >
                  View My Rewards Card
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Button
                  variant="primary"
                  block
                  onClick={() => navigate(`/login/customer?redirect=${encodeURIComponent(location.pathname)}`)}
                >
                  Join / Sign In to Claim Rewards
                </Button>
                <span style={{ fontSize: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Instant OTP login • No password required
                </span>
              </div>
            )}
          </Card>
        )}

        {/* Tab 3: TABLE RESERVATION */}
        {activeTab === 'table' && (
          <Card style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <Calendar size={28} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
              Book a Table at {business.name}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              Reserve a table in advance for zero waiting time and guaranteed seating.
            </p>
            <Button
              variant="primary"
              block
              onClick={() => navigate(`/customer/table-booking?business_id=${business.id}${tableId ? `&table=${tableId}` : ''}`)}
            >
              Proceed to Table Booking
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};
