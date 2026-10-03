import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User, Phone, Mail, Lock, ArrowRight, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { RealOTPVerification } from '../../components/auth/RealOTPVerification';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';

export const CustomerSignup = () => {
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/customer';

  const [authMode, setAuthMode] = useState('email'); // 'email' or 'otp'
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
  });

  // OTP state
  const [otpPhone, setOtpPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpName, setOtpName] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');
  const [createdCustomer, setCreatedCustomer] = useState(null);
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const { registerCustomer, loginWithGoogle, requestOTP, verifyOTP } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const updateField = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    if (errorDetail) setErrorDetail('');
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setErrorDetail('');

    if (!formData.name.trim()) {
      setErrorDetail('Please enter your full name');
      return;
    }
    if (!formData.email.trim() && !formData.phone.trim()) {
      setErrorDetail('Please enter either an email or phone number');
      return;
    }

    setLoading(true);
    try {
      const res = await registerCustomer({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        password: formData.password || 'customer123',
      });

      if (res.error || res.detail) {
        const msg = res.detail || res.error;
        setErrorDetail(msg);
        addToast(msg, 'error');
      } else {
        setCreatedCustomer(res.customer);
        addToast('Welcome! Your customer pass is activated.', 'success');
      }
    } catch (err) {
      const msg = err.message || 'Error registering customer';
      setErrorDetail(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // OTP flow
  const handleRequestOtp = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setErrorDetail('');
    if (!otpPhone.trim()) {
      setErrorDetail('Please enter a phone number');
      return;
    }
    setLoading(true);
    try {
      const res = await requestOTP(otpPhone.trim(), 'SIGNUP');
      if (res.error) {
        setErrorDetail(res.error);
        addToast(res.error, 'error');
      } else {
        setOtpSent(true);
        addToast(res.message || 'Verification code sent via SMS!', 'success');
      }
    } catch {
      setErrorDetail('Failed to send OTP. Please check phone number.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (code) => {
    if (loading) return false;
    const cleanCode = (code || '').trim();
    if (cleanCode.length !== 6) return false;
    setErrorDetail('');
    setLoading(true);
    try {
      const res = await verifyOTP(otpPhone.trim(), code, otpName.trim());
      if (res.error) {
        setErrorDetail(res.error);
        addToast(res.error, 'error');
        return false;
      } else {
        setCreatedCustomer(res.customer);
        addToast('Phone verified! Welcome to ZoorUp.', 'success');
        return true;
      }
    } catch {
      setErrorDetail('Verification failed. Please retry.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async (token) => {
    setLoading(true);
    setErrorDetail('');
    try {
      const res = await loginWithGoogle({ token, role: 'CUSTOMER' });
      if (res.error) {
        setErrorDetail(res.error);
      } else {
        setShowGoogleModal(false);
        addToast(`Welcome, ${res.user.name}!`, 'success');
        navigate(redirectTarget);
      }
    } catch {
      setErrorDetail('Google sign-in error');
    } finally {
      setLoading(false);
    }
  };

  if (createdCustomer) {
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
            maxWidth: '460px',
            width: '100%',
            textAlign: 'center',
            padding: '2.5rem 1.75rem',
            border: '1px solid var(--border-default)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--success-bg)',
              color: 'var(--accent-emerald)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}
          >
            <CheckCircle2 size={34} />
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Welcome to ZoorUp, {createdCustomer.name}!
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Here is your unique ZoorUp Customer Pass. Present this code at any participating merchant for points & rewards.
          </p>

          <div
            style={{
              padding: '1.25rem',
              background: '#1A2B49',
              border: '1px solid #243B5F',
              borderRadius: '16px',
              marginBottom: '1.75rem',
              color: '#FFFFFF',
              boxShadow: '0 8px 24px rgba(26, 43, 73, 0.18)',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Official Customer Pass ID
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.6rem',
                fontWeight: 800,
                color: '#F59E0B',
                letterSpacing: '0.05em',
                margin: '0.5rem 0',
              }}
            >
              {createdCustomer.customer_id}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.12)', paddingTop: '0.5rem', color: '#CBD5E1' }}>
              <span>Membership: <strong style={{ color: '#F59E0B' }}>{createdCustomer.membership_tier || 'MEMBER'}</strong></span>
              <span>Points Balance: <strong style={{ color: '#F59E0B' }}>{createdCustomer.points || 0} pts</strong></span>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => navigate(redirectTarget)}
            icon={ArrowRight}
          >
            Enter Customer Hub
          </Button>
        </div>
      </div>
    );
  }

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
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <ZoorUpLogo size="lg" width={76} height={76} style={{ margin: '0 auto 1.25rem' }} priority />
          <h2 style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Join ZoorUp Customer Pass
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Earn reward points, order ahead & unlock local store cashbacks
          </p>
        </div>

        {/* Error Alert */}
        {errorDetail && (
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
            <span>{errorDetail}</span>
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
          Continue with Google
        </button>

        {/* Auth Mode Tabs: Email vs Phone OTP */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '1.25rem',
          }}
        >
          <button
            type="button"
            onClick={() => setAuthMode('email')}
            style={{
              flex: 1,
              padding: '0.65rem',
              background: 'none',
              border: 'none',
              borderBottom: authMode === 'email' ? '2px solid #F59E0B' : '2px solid transparent',
              color: authMode === 'email' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: authMode === 'email' ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Email Registration
          </button>
          <button
            type="button"
            onClick={() => setAuthMode('otp')}
            style={{
              flex: 1,
              padding: '0.65rem',
              background: 'none',
              border: 'none',
              borderBottom: authMode === 'otp' ? '2px solid #F59E0B' : '2px solid transparent',
              color: authMode === 'otp' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: authMode === 'otp' ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Phone OTP Verification
          </button>
        </div>

        {/* Email Mode Form */}
        {authMode === 'email' && (
          <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Input
              label="Full Name"
              placeholder="[ Enter your full name ]"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              required
              icon={User}
              autoComplete="name"
              autoFocus
            />

            <Input
              label="Phone Number"
              type="tel"
              placeholder="[ Enter phone number ]"
              value={formData.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              icon={Phone}
              autoComplete="tel"
            />

            <Input
              label="Email Address"
              type="email"
              placeholder="[ Enter email ]"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              icon={Mail}
              autoComplete="email"
            />

            <Input
              label="Password"
              type="password"
              placeholder="[ Create password ]"
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
              required
              icon={Lock}
              autoComplete="new-password"
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              loading={loading}
              icon={Sparkles}
              style={{ marginTop: '0.5rem' }}
            >
              Claim Customer Pass
            </Button>
          </form>
        )}

        {/* OTP Mode Form */}
        {authMode === 'otp' && (
          <div>
            {!otpSent ? (
              <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Input
                  label="Your Name (Optional)"
                  placeholder="[ Enter your name ]"
                  value={otpName}
                  onChange={(e) => setOtpName(e.target.value)}
                  icon={User}
                />
                <Input
                  label="Mobile Phone Number"
                  type="tel"
                  placeholder="[ Enter 10-digit mobile number ]"
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(e.target.value)}
                  required
                  icon={Phone}
                  autoFocus
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  block
                  loading={loading}
                  icon={ArrowRight}
                >
                  Send Verification OTP
                </Button>
              </form>
            ) : (
              <RealOTPVerification
                phone={otpPhone}
                purpose="SIGNUP"
                loading={loading}
                onRequestNewOtp={() => handleRequestOtp()}
                onVerify={(code) => handleVerifyOtp(code)}
                onBack={() => setOtpSent(false)}
              />
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Already have a customer account?{' '}
          <Link to="/login/customer" style={{ color: '#1A2B49', fontWeight: 600 }}>
            Sign In
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
