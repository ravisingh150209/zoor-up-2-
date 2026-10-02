import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, ShieldCheck, Mail, Lock, ArrowRight } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login({ identifier: email, password, role: 'admin' });
      if (res.error) {
        addToast(res.error, 'error');
      } else {
        addToast('Admin security clearance verified', 'success');
        navigate('/admin');
      }
    } catch (err) {
      addToast('Admin authentication failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAFAFB',
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
          maxWidth: '420px',
          padding: '2.25rem 1.75rem',
          border: '1px solid #E2E8F0',
          background: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <ZoorUpLogo size="lg" width={72} height={72} style={{ margin: '0 auto 1.25rem' }} priority />
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49' }}>
            ZoorUp Platform Admin
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
            Restricted Master Console • Authorized Personnel Only
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Input
            label="Superadmin Email"
            type="email"
            required
            icon={Mail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@zoorup.com"
          />

          <Input
            label="Master Password"
            type="password"
            required
            icon={Lock}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <Button type="submit" variant="primary" block loading={loading} icon={ArrowRight} style={{ marginTop: '0.75rem' }}>
            Authorize Access
          </Button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.75rem' }}>
          <Link to="/login" style={{ fontSize: '0.8rem', color: '#1A2B49', fontWeight: 600 }}>
            ← Return to Public Portal
          </Link>
        </div>
      </div>
    </div>
  );
};
