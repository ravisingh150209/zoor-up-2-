import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Store, User, Users, Truck, ShieldCheck, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';

export const AuthHub = () => {
  const navigate = useNavigate();
  const { user, loading, isAuthenticated } = useAuth();

  React.useEffect(() => {
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

  const roleCards = [
    {
      role: 'business',
      title: 'Business Owner',
      description: 'Manage store, products, orders, billing, inventory & loyalty.',
      icon: Store,
      badge: 'Popular',
      loginPath: '/login/business',
      signupPath: '/signup/business',
      accent: '#1A2B49',
    },
    {
      role: 'customer',
      title: 'Customer',
      description: 'Secure login with registered mobile number and SMS OTP.',
      icon: User,
      badge: 'Mobile OTP',
      loginPath: '/login/customer',
      signupPath: '/signup/customer',
      accent: '#F59E0B',
    },
    {
      role: 'staff',
      title: 'Business Staff',
      description: 'Process orders, operate billing POS counter & update stock.',
      icon: Users,
      badge: 'Staff Access',
      loginPath: '/login/staff',
      accent: '#243B5F',
    },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAFAFB',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '2rem 1.5rem',
      }}
    >
      {/* Brand Header */}
      <header
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }} aria-label="ZOOR UP Home">
          <ZoorUpLogo size="md" width={48} height={48} priority />
          <div>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49', letterSpacing: '-0.02em' }}>
              ZOOR<span style={{ color: '#F59E0B' }}>UP</span>
            </span>
            <p style={{ fontSize: '0.75rem', color: '#64748B' }}>
              Smart Business. Simple Management.
            </p>
          </div>
        </Link>

        <Link
          to="/login/admin"
          style={{
            fontSize: '0.8rem',
            color: '#64748B',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            textDecoration: 'none',
          }}
        >
          <ShieldCheck size={14} color="#F59E0B" />
          <span>Platform Admin</span>
        </Link>
      </header>

      {/* Main Choice Section */}
      <main
        style={{
          maxWidth: '1000px',
          margin: '2rem auto',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div style={{ marginBottom: '2.5rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.85rem',
              borderRadius: '999px',
              background: '#FEF3C7',
              color: '#D97706',
              fontSize: '0.825rem',
              fontWeight: 600,
              marginBottom: '1rem',
              border: '1px solid #FDE68A',
            }}
          >
            <Sparkles size={14} /> Unified Local Commerce SaaS Platform
          </span>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', color: '#1A2B49', marginBottom: '0.75rem', fontWeight: 800 }}>
            Continue as
          </h1>
          <p style={{ fontSize: '1.05rem', color: '#475569', maxWidth: '580px', margin: '0 auto' }}>
            Select your account type to access your specialized workspace or onboard your business.
          </p>
        </div>

        {/* 4 Clean Action Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
            textAlign: 'left',
          }}
        >
          {roleCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.role}
                className="card card-hover"
                style={{
                  padding: '1.75rem 1.35rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1.25rem',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <div>
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '12px',
                      background: '#1A2B49',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#F59E0B',
                      marginBottom: '1.25rem',
                      boxShadow: '0 4px 12px rgba(26, 43, 73, 0.15)',
                    }}
                  >
                    <Icon size={26} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1A2B49' }}>
                      {card.title}
                    </h3>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.45 }}>
                    {card.description}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Link
                    to={card.loginPath}
                    className="btn btn-primary btn-block"
                    style={{ fontSize: '0.875rem' }}
                  >
                    <span>Sign In</span>
                    <ArrowRight size={15} />
                  </Link>

                  {card.signupPath && (
                    <Link
                      to={card.signupPath}
                      className="btn btn-secondary btn-block"
                      style={{ fontSize: '0.825rem' }}
                    >
                      New Registration
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '1rem', color: '#64748B', fontSize: '0.8rem' }}>
        © {new Date().getFullYear()} ZoorUp Technologies. Engineered for restaurants, grocers, salons, retail, and local services.
      </footer>
    </div>
  );
};
