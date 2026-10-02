import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Store,
  Mail,
  Lock,
  Phone,
  User,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton';

export const BusinessSignup = () => {
  const [formData, setFormData] = useState({
    name: '',
    owner_name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    selected_plan: 'FREE',
  });

  const [loading, setLoading] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const { registerBusiness, loginWithGoogle } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const updateField = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    if (errorDetail) setErrorDetail('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorDetail('');

    if (!formData.name.trim()) {
      setErrorDetail('Business Name is required');
      addToast('Business Name is required', 'error');
      return;
    }
    if (!formData.email.trim()) {
      setErrorDetail('Email address is required');
      addToast('Email address is required', 'error');
      return;
    }
    if (formData.password.length < 6) {
      setErrorDetail('Password must be at least 6 characters');
      addToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorDetail('Passwords do not match');
      addToast('Passwords do not match', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await registerBusiness({
        name: formData.name.trim(),
        owner_name: formData.owner_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password,
        selected_plan: formData.selected_plan,
      });

      if (res.error || res.detail) {
        const msg = res.detail || res.error;
        setErrorDetail(msg);
        addToast(msg, 'error');
      } else {
        addToast('Account created! Your business is ACTIVE.', 'success');
        // Instantly navigate to Onboarding Wizard
        navigate('/business/onboarding');
      }
    } catch (err) {
      const msg = err.message || 'Error creating business account. Please try again.';
      setErrorDetail(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async (token) => {
    setErrorDetail('');
    try {
      const res = await loginWithGoogle({ token, role: 'BUSINESS' });

      if (res.error) {
        setErrorDetail(res.error);
        addToast(res.error, 'error');
      } else {
        addToast(`Google login successful! Welcome, ${res.user.name}.`, 'success');
        setShowGoogleModal(false);
        if (res.user.onboarding_completed) {
          navigate('/business');
        } else {
          navigate('/business/onboarding');
        }
      }
    } catch (err) {
      setErrorDetail('Google authentication failed. Please try again.');
      addToast('Google sign-in error', 'error');
    } finally {
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        padding: '2.5rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '2.5rem 2rem',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <ZoorUpLogo size="lg" width={76} height={76} style={{ margin: '0 auto 1.25rem' }} priority />
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Register Your Business
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Instant account activation • No waiting for admin approval
          </p>
        </div>

        {/* Instant Active Guarantee Badge */}
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            color: 'var(--accent-emerald)',
            fontSize: '0.85rem',
          }}
        >
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>
            <strong>Instant Activation:</strong> Your business status will be <strong>ACTIVE</strong> immediately upon registration.
          </span>
        </div>

        {/* Error Detail Banner */}
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

        {/* Google OAuth Quick Button */}
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
          Continue with Google / Gmail
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
          <span>OR SIGN UP WITH EMAIL</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
        </div>

        {/* Registration Form with Empty Fields & Proper Placeholders */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <Input
            label="Business Name"
            placeholder="[ Enter your business name ]"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            required
            icon={Store}
            autoComplete="organization"
          />

          <Input
            label="Owner Full Name"
            placeholder="[ Enter owner name ]"
            value={formData.owner_name}
            onChange={(e) => updateField('owner_name', e.target.value)}
            icon={User}
            autoComplete="name"
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="[ Enter email ]"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            required
            icon={Mail}
            autoComplete="email"
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
            label="Password"
            type="password"
            placeholder="[ Create secure password (min 6 chars) ]"
            value={formData.password}
            onChange={(e) => updateField('password', e.target.value)}
            required
            icon={Lock}
            autoComplete="new-password"
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="[ Re-enter password ]"
            value={formData.confirmPassword}
            onChange={(e) => updateField('confirmPassword', e.target.value)}
            required
            icon={Lock}
            autoComplete="new-password"
          />

          {/* Plan Selection */}
          <div style={{ marginTop: '0.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Select Initial Plan (Free Registration)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {[
                { id: 'FREE', name: 'Free', price: '₹0', tag: 'Default', popular: true },
                { id: 'STARTER', name: 'Starter', price: '₹299/mo', tag: 'Paid Tier' },
                { id: 'GROWTH', name: 'Growth', price: '₹799/mo', tag: 'Paid Tier' },
                { id: 'PRO', name: 'Pro', price: '₹1499/mo', tag: 'Paid Tier' },
              ].map((p) => {
                const isSelected = formData.selected_plan === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => updateField('selected_plan', p.id)}
                    style={{
                      padding: '0.65rem 0.4rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                      background: isSelected ? '#FEF3C7' : 'var(--bg-surface-elevated)',
                      border: isSelected ? '2px solid #F59E0B' : '1px solid var(--border-default)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    {p.popular && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '-8px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#1A2B49',
                          color: '#fff',
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '999px',
                        }}
                      >
                        BEST
                      </span>
                    )}
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isSelected ? '#D97706' : 'var(--text-primary)' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '2px 0' }}>
                      {p.price}
                    </div>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '0.625rem',
                        fontWeight: 600,
                        color: p.id === 'FREE' ? 'var(--text-muted)' : 'var(--accent-emerald)',
                        background: p.id === 'FREE' ? 'rgba(255,255,255,0.06)' : 'rgba(16, 185, 129, 0.12)',
                        padding: '1px 4px',
                        borderRadius: '4px',
                      }}
                    >
                      {p.tag}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Trial Guarantee Note */}
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.65rem 0.85rem',
                background: formData.selected_plan === 'FREE' ? 'rgba(255,255,255,0.03)' : 'rgba(245, 158, 11, 0.1)',
                border: formData.selected_plan === 'FREE' ? '1px solid var(--border-subtle)' : '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                fontSize: '0.8rem',
              }}
            >
              <Sparkles size={16} style={{ color: '#F59E0B', flexShrink: 0 }} />
              <div>
                {formData.selected_plan === 'FREE' ? (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Basic account on Free tier. Upgrade anytime to access premium retention tools.
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-primary)' }}>
                    <strong>30 Days Free Trial</strong> on {formData.selected_plan} • <strong>₹0 charged today</strong> • No payment required during trial.
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={loading}
            icon={ArrowRight}
            style={{ marginTop: '0.5rem' }}
          >
            Create Account & Start {formData.selected_plan === 'FREE' ? 'Free Plan' : '30-Day Free Trial'}
          </Button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Already have a business account?{' '}
          <Link to="/login/business" style={{ color: '#1A2B49', fontWeight: 600 }}>
            Sign In
          </Link>
        </div>
      </div>

      {/* Google Sign In Modal */}
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
