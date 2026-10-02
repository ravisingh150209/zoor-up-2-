import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Store,
  QrCode,
  Award,
  ShoppingBag,
  Users,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Zap,
  TrendingUp,
  Receipt,
  Truck,
  HeartHandshake
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { PublicNavbar } from '../../components/layout/PublicNavbar';
import { DEFAULT_PLANS } from '../../services/storageSeed';
import { useAuth } from '../../context/AuthContext';

export const PublicLanding = () => {
  const { user, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      const role = (user.role || '').toLowerCase();
      if (role === 'customer') {
        navigate('/customer', { replace: true });
      } else if (role === 'admin' || role === 'super_admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/business', { replace: true });
      }
    }
  }, [user, loading, isAuthenticated, navigate]);
  const verticals = [
    'Grocery & Supermarket',
    'Restaurants & Cafes',
    'Salons & Spas',
    'Bakeries & Sweets',
    'Clothing & Boutiques',
    'Pharmacies & Health',
    'Electronics & Repairs',
    'Local Retailers',
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <PublicNavbar />

      {/* Hero Section */}
      <section
        style={{
          padding: '4rem 1.5rem 3rem',
          textAlign: 'center',
          background: 'radial-gradient(circle at 50% 0%, #FEF3C7 0%, var(--bg-app) 80%)',
          position: 'relative',
        }}
      >
        <div style={{ maxWidth: '880px', margin: '0 auto' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 1rem',
              borderRadius: '999px',
              background: '#FEF3C7',
              border: '1px solid #FDE68A',
              color: '#D97706',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '1.5rem',
            }}
          >
            <Sparkles size={15} /> Unified Local Business Management SaaS
          </span>

          <h1
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              color: '#1A2B49',
              marginBottom: '1.25rem',
            }}
          >
            Smart Business. <br />
            <span
              style={{
                color: '#F59E0B',
              }}
            >
              Simple Management.
            </span>
          </h1>

          <p
            style={{
              fontSize: 'clamp(1rem, 2vw, 1.25rem)',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              maxWidth: '680px',
              margin: '0 auto 2.5rem',
            }}
          >
            ZoorUp replaces fractured POS software, scattered paper bills, and complex loyalty schemes with one powerful, multi-role operating system for local retailers, cafes, and services.
          </p>

          {/* Call to Actions */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link to="/signup/business" className="btn btn-primary btn-lg" style={{ minWidth: '180px' }}>
              <span>Start Free Trial</span>
              <ArrowRight size={18} />
            </Link>

            <Link to="/download" className="btn btn-secondary btn-lg" style={{ minWidth: '180px' }}>
              <Smartphone size={18} />
              <span>Get Mobile App</span>
            </Link>

            <Link to="/login" className="btn btn-outline btn-lg" style={{ minWidth: '150px' }}>
              <span>Sign In</span>
            </Link>
          </div>

          {/* Industry Vertical Badges */}
          <div style={{ marginTop: '3.5rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
              Engineered for Modern Indian Local Retailers & Services:
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {verticals.map((v) => (
                <span
                  key={v}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '999px',
                    background: '#FFFFFF',
                    border: '1px solid var(--border-default)',
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4 Feature Pillars */}
      <section style={{ padding: '3.5rem 1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1A2B49' }}>Everything You Need in One Box</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.35rem' }}>
            Built for multi-device reliability across Android phones, tablets, iPads, and desktops.
          </p>
        </div>

        <div className="grid-3">
          <Card style={{ padding: '1.75rem', background: '#FFFFFF', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--color-accent-light)', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', marginBottom: '1rem' }}>
              <QrCode size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1A2B49' }}>Digital QR Standees</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Print instant table standees. Customers scan with any phone to browse interactive menus, order items, and checkout without installing apps.
            </p>
          </Card>

          <Card style={{ padding: '1.75rem', background: '#FFFFFF', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--color-accent-light)', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', marginBottom: '1rem' }}>
              <Award size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1A2B49' }}>Universal Loyalty CRM</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Automatic reward points (₹100 = 10 pts) and Bronze-to-VIP tier progression. Issue digital customer passes formatted as <code>ZUP-CUS-000001</code>.
            </p>
          </Card>

          <Card style={{ padding: '1.75rem', background: '#FFFFFF', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--color-accent-light)', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', marginBottom: '1rem' }}>
              <Receipt size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1A2B49' }}>POS Billing & Inventory</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Counter invoicing, automated GST taxes, low-stock threshold alerts, and thermal printer compatibility out of the box.
            </p>
          </Card>
        </div>
      </section>

      {/* Subscription Pricing Grid */}
      <section style={{ padding: '3.5rem 1.5rem', background: '#FFFFFF', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', color: '#1A2B49' }}>Transparent SaaS Pricing</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '2.5rem' }}>
            Affordable monthly plans engineered for independent local businesses.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1.25rem',
              textAlign: 'left',
            }}
          >
            {DEFAULT_PLANS.map((plan) => (
              <Card
                key={plan.id}
                style={{
                  padding: '1.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: plan.recommended ? '2px solid var(--color-accent)' : '1px solid var(--border-default)',
                  background: '#FFFFFF',
                  position: 'relative',
                  boxShadow: plan.recommended ? '0 10px 25px rgba(245, 158, 11, 0.15)' : 'var(--shadow-card)',
                }}
              >
                <div>
                  {plan.recommended && (
                    <Badge variant="warning" style={{ position: 'absolute', top: '-10px', right: '15px' }}>
                      Most Popular
                    </Badge>
                  )}
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49' }}>{plan.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', margin: '0.75rem 0 1.25rem' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--color-primary)' }}>₹{plan.price}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>/ month</span>
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    {plan.features.map((f, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', color: 'var(--text-body)' }}>
                        <CheckCircle2 size={15} style={{ color: '#22C55E', marginTop: '3px', flexShrink: 0 }} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginTop: '2rem' }}>
                  <Link
                    to="/signup/business"
                    className={`btn ${plan.recommended ? 'btn-primary' : 'btn-secondary'} btn-block`}
                  >
                    Select {plan.name}
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem', background: '#FAFAFB', borderTop: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <ZoorUpLogo size="sm" width={42} height={42} />
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>© {new Date().getFullYear()} ZoorUp SaaS Platform. "Smart Business. Simple Management." All rights reserved.</p>
        <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <Link to="/download" style={{ color: 'var(--color-accent-dark)', fontWeight: 600 }}>Download App (Android & iOS)</Link>
          <Link to="/login" style={{ color: 'var(--text-secondary)' }}>Portal Gateways</Link>
          <Link to="/login/admin" style={{ color: 'var(--text-secondary)' }}>Platform Admin</Link>
          <Link to="/m/green-leaf-grocery" target="_blank" style={{ color: 'var(--text-secondary)' }}>Sample Store</Link>
        </div>
      </footer>
    </div>
  );
};
