import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, QrCode, Lock, ArrowRight, Sparkles, CheckCircle2, Phone, AlertCircle, KeyRound } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { RealOTPVerification } from '../../components/auth/RealOTPVerification';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';

export const CustomerLogin = () => {
  const [loginMode, setLoginMode] = useState('id'); // 'id' or 'otp'
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpHint, setOtpHint] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const { login, loginWithGoogle, requestOTP, verifyOTP, user, isAuthenticated, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      navigate('/customer', { replace: true });
    }
  }, [user, authLoading, isAuthenticated, navigate]);

  const handleIdSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await login({ identifier: identifier.trim(), password, role: 'customer' });
      if (res.error) {
        setErrorMsg(res.error);
        addToast(res.error, 'error');
      } else {
        addToast(`Welcome back, ${res.user.name}!`, 'success');
        navigate('/customer');
      }
    } catch (err) {
      setErrorMsg('Login failed. Please check your credentials.');
      addToast('Customer login error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setErrorMsg('');
    if (!otpPhone.trim()) {
      setErrorMsg('Please enter a phone number');
      return;
    }
    setLoading(true);
    try {
      const res = await requestOTP(otpPhone.trim());
      if (res.error) {
        setErrorMsg(res.error);
        addToast(res.error, 'error');
      } else {
        setOtpSent(true);
        addToast(res.message || 'Verification code sent!', 'success');
      }
    } catch {
      setErrorMsg('Failed to send OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (enteredCode) => {
    if (loading) return;
    const codeToVerify = (enteredCode || otpCode || '').trim();
    if (codeToVerify.length !== 6) return;
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await verifyOTP(otpPhone.trim(), codeToVerify);
      if (res.error) {
        setErrorMsg(res.error);
        addToast(res.error, 'error');
      } else {
        addToast(`Welcome, ${res.user.name || 'Member'}!`, 'success');
        navigate('/customer');
      }
    } catch {
      setErrorMsg('Verification failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async (token) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await loginWithGoogle({ token, role: 'CUSTOMER' });
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setShowGoogleModal(false);
        addToast(`Welcome, ${res.user.name}!`, 'success');
        navigate('/customer');
      }
    } catch {
      setErrorMsg('Google sign in error');
    } finally {
      setLoading(false);
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
          maxWidth: '440px',
          padding: '2rem 1.75rem',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <ZoorUpLogo size="lg" width={76} height={76} style={{ margin: '0 auto 1.25rem' }} priority />
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Customer Sign In
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Access your orders, loyalty points, rewards & linked businesses
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              color: 'var(--danger-text)',
              fontSize: '0.85rem',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Google Quick Button */}
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

        {/* Tab Toggle */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '1.25rem',
          }}
        >
          <button
            type="button"
            onClick={() => setLoginMode('id')}
            style={{
              flex: 1,
              padding: '0.65rem',
              background: 'none',
              border: 'none',
              borderBottom: loginMode === 'id' ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: loginMode === 'id' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: loginMode === 'id' ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Customer ID / Email
          </button>
          <button
            type="button"
            onClick={() => setLoginMode('otp')}
            style={{
              flex: 1,
              padding: '0.65rem',
              background: 'none',
              border: 'none',
              borderBottom: loginMode === 'otp' ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: loginMode === 'otp' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: loginMode === 'otp' ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Phone OTP Login
          </button>
        </div>

        {/* Form Mode 1: Customer ID or Email */}
        {loginMode === 'id' && (
          <form onSubmit={handleIdSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Input
              label="Customer ID, Email or Phone"
              required
              icon={QrCode}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="[ Enter Customer ID, email or phone ]"
              autoComplete="username"
              autoFocus
            />

            <Input
              label="Password"
              type="password"
              required
              icon={Lock}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="[ Enter password ]"
              autoComplete="current-password"
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', fontSize: '0.8rem' }}>
              <Link to="/forgot-password" style={{ color: 'var(--accent-cyan)' }}>
                Forgot password?
              </Link>
            </div>

            <Button type="submit" variant="primary" block loading={loading} icon={ArrowRight}>
              Sign In to Pass
            </Button>
          </form>
        )}

        {/* Form Mode 2: Phone OTP */}
        {loginMode === 'otp' && (
          <div>
            {!otpSent ? (
              <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Input
                  label="Registered Mobile Phone"
                  type="tel"
                  placeholder="[ Enter 10-digit mobile number ]"
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(e.target.value)}
                  required
                  icon={Phone}
                  autoComplete="tel"
                  autoFocus
                />
                <Button type="submit" variant="primary" block loading={loading} icon={ArrowRight}>
                  Request OTP Code
                </Button>
              </form>
            ) : (
              <RealOTPVerification
                phone={otpPhone}
                onVerify={handleVerifyOtp}
                onRequestResend={handleRequestOtp}
                onChangePhone={() => setOtpSent(false)}
                loading={loading}
                errorMsg={errorMsg}
              />
            )}
          </div>
        )}

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
          }}
        >
          Don't have a Customer Pass yet?{' '}
          <Link to="/signup/customer" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
            Claim Free Pass (+100 Pts)
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
              Customer Google Sign-In
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Choose a Google account to continue to your Customer Pass.
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
