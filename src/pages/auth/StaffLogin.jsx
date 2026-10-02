import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Mail, Lock, ArrowRight, Shield } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const StaffLogin = () => {
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
      const res = await login({ identifier: email, password, role: 'staff' });
      if (res.error) {
        addToast(res.error, 'error');
      } else {
        addToast(`Welcome back, ${res.user.name}! (Staff Access)`, 'success');
        navigate('/business');
      }
    } catch (err) {
      addToast('Staff login failed', 'error');
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
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <ZoorUpLogo size="lg" width={72} height={72} style={{ margin: '0 auto 1.25rem' }} priority />
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Staff Terminal Sign In
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Operate POS counter, dispatch deliveries, manage orders & inventory
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Input
            label="Staff Work Email or ID"
            type="email"
            required
            icon={Mail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@store.com"
          />

          <Input
            label="Password"
            type="password"
            required
            icon={Lock}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <Button type="submit" variant="primary" block loading={loading} icon={ArrowRight} style={{ marginTop: '0.5rem' }}>
            Enter POS & Operations
          </Button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link to="/login" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            ← Switch Account Role
          </Link>
        </div>
      </div>
    </div>
  );
};
