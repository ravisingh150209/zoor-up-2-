import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Store, Mail, Lock, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';

export const BusinessLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { login, loginWithGoogle, user, isAuthenticated, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      navigate('/business', { replace: true });
    }
  }, [user, authLoading, isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await login({ identifier: email.trim(), password, role: 'business' });
      if (res.error) {
        setErrorMsg(res.error);
        addToast(res.error, 'error');
      } else {
        addToast(`Welcome back, ${res.user.name}!`, 'success');
        if (res.user.onboarding_completed === false) {
          navigate('/business/onboarding');
        } else {
          navigate('/business');
        }
      }
    } catch (err) {
      setErrorMsg('Failed to sign in. Please check your credentials.');
      addToast('Failed to sign in. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async (token) => {
    setErrorMsg('');
    try {
      const res = await loginWithGoogle({ token, role: 'BUSINESS' });

      if (res.error) {
        setErrorMsg(res.error);
        addToast(res.error, 'error');
      } else {
        addToast(`Google sign-in successful! Welcome, ${res.user.name}.`, 'success');
        setShowGoogleModal(false);
        if (res.user.onboarding_completed === false) {
          navigate('/business/onboarding');
        } else {
          navigate('/business');
        }
      }
    } catch (err) {
      setErrorMsg('Google login failed.');
      addToast('Google login failed', 'error');
    } finally {
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '2.5rem 2rem',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Top Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <ZoorUpLogo size="lg" width={76} height={76} style={{ margin: '0 auto 1.25rem' }} priority />
          <h2 style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Business Owner Portal
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage store operations, orders, inventory & customers
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              padding: '0.85rem 1rem',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              color: 'var(--danger-text)',
              fontSize: '0.875rem',
            }}
          >
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Google Quick Sign-In */}
        <button
          type="button"
          onClick={() => setShowGoogleModal(true)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: '1.25rem',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Sign in with Google
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            margin: '1.25rem 0',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            textAlign: 'center',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
          <span>OR WITH EMAIL</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Business Email / Phone"
            type="text"
            required
            icon={Mail}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="[ Enter registered email or phone ]"
            autoComplete="email"
            autoFocus
          />

          <Input
            label="Password"
            type="password"
            required
            icon={Lock}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="[ Enter password ]"
            autoComplete="current-password"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', fontSize: '0.8rem' }}>
            <Link
              to="/forgot-password"
              style={{ color: 'var(--accent-indigo)', fontWeight: 500 }}
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" variant="primary" size="lg" block loading={loading} icon={ArrowRight}>
            Sign In to Dashboard
          </Button>
        </form>

        {/* Footer Link to Instant Registration */}
        <div
          style={{
            marginTop: '1.75rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
          }}
        >
          New merchant?{' '}
          <Link
            to="/signup/business"
            style={{ color: 'var(--accent-indigo)', fontWeight: 700 }}
          >
            Create Instant Account
          </Link>
        </div>
      </div>

      {/* Google Modal */}
      {showGoogleModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '1rem',
          }}
        >
          <div
            className="card animate-scale-up"
            style={{
              maxWidth: '420px',
              width: '100%',
              padding: '2rem 1.75rem',
              border: '1px solid var(--border-default)',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              Google Sign-In
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Choose a Google account to continue to your business workspace.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem' }}>
              <GoogleSignInButton onCredential={handleGoogleAuth} />
              <Button
                variant="ghost"
                block
                onClick={() => setShowGoogleModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
