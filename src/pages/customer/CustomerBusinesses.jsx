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
  Star
} from 'lucide-react';
import { businessService } from '../../services/businessService';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { SearchBar, Tabs } from '../../components/ui/Controls';
import { LoadingState } from '../../components/ui/States';

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
      const data = await businessService.getAllBusinesses({ category, search });
      setBusinesses(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Explore Partnered Businesses</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Discover local groceries, cafes, pharmacies, and salons offering ZoorUp digital menus and loyalty perks.
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
        <LoadingState message="Discovering businesses..." />
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
