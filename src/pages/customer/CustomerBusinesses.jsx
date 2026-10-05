import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  Search,
  MapPin,
  Clock,
  Sparkles,
  ArrowRight,
  Store,
  Star,
  QrCode
} from 'lucide-react';
import { customerService } from '../../services/customerService';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { SearchBar, Tabs } from '../../components/ui/Controls';
import { LoadingState, EmptyState } from '../../components/ui/States';
import { Button } from '../../components/ui/Button';

export const CustomerBusinesses = () => {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const CATEGORIES = [
    'All',
    'Grocery',
    'Cafe',
    'Salon',
    'Pharmacy',
    'Bakery',
  ];

  useEffect(() => {
    loadBusinesses();
  }, [category, search]);

  const loadBusinesses = async () => {
    setLoading(true);
    try {
      const homeData = await customerService.getCustomerHome();
      let list = (homeData && Array.isArray(homeData.businesses)) ? homeData.businesses : [];

      if (category && category !== 'All') {
        list = list.filter(b => b.category && b.category.toLowerCase().includes(category.toLowerCase()));
      }
      if (search) {
        const q = search.toLowerCase();
        list = list.filter(b => (b.name && b.name.toLowerCase().includes(q)) || (b.city && b.city.toLowerCase().includes(q)));
      }
      setBusinesses(list);
    } catch (e) {
      console.error('Error loading connected businesses:', e);
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>My Connected Stores</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Stores and businesses where you have checked in, placed orders, or joined the loyalty program.
        </p>
      </div>

      <Tabs
        activeTab={category}
        onChange={setCategory}
        tabs={CATEGORIES.map((c) => ({ id: c, label: c }))}
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search stores by name, city, or specialty..."
      />

      {loading ? (
        <LoadingState message="Loading your connected stores..." />
      ) : businesses.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No connected stores found"
          description="Scan a ZOOR UP QR code at your favorite store or cafe to join their loyalty program and view their digital menu here."
          action={
            <Button
              variant="primary"
              onClick={() => navigate('/customer/scan-qr')}
              icon={QrCode}
              style={{ background: '#1A2B49', color: '#FFFFFF', fontWeight: 700 }}
            >
              Scan Store QR to Connect
            </Button>
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {businesses.map((biz) => (
            <div
              key={biz.id}
              className="card card-hover"
              onClick={() => navigate(`/m/${biz.slug}`)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '0',
                overflow: 'hidden',
              }}
            >
              <div>
                <div style={{ position: 'relative', height: '140px' }}>
                  <img
                    src={biz.cover_image}
                    alt={biz.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <img
                    src={biz.logo}
                    alt={biz.name}
                    style={{
                      position: 'absolute',
                      bottom: '-16px',
                      left: '16px',
                      width: '46px',
                      height: '46px',
                      borderRadius: 'var(--radius-md)',
                      border: '2px solid #fff',
                      background: '#fff',
                      objectFit: 'cover',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                    }}
                  />
                </div>

                <div style={{ padding: '1.5rem 1.15rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary-400)', fontWeight: 600 }}>
                      {biz.category}
                    </span>
                    <Badge variant="success" style={{ fontSize: '0.65rem' }}>10 pts / ₹100</Badge>
                  </div>

                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {biz.name}
                  </h3>

                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {biz.description}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <MapPin size={13} />
                    <span>{biz.address}, {biz.city}</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: '0.85rem 1.15rem',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-elevated)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {biz.open_time} - {biz.close_time}
                </span>
                <span style={{ color: 'var(--primary-400)', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Open Menu <ArrowRight size={14} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
