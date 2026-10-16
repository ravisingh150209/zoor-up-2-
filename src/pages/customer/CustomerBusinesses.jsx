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
  QrCode,
  Calendar,
  UtensilsCrossed,
  Phone,
  RefreshCw
} from 'lucide-react';
import { customerService } from '../../services/customerService';
import { businessService } from '../../services/businessService';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { SearchBar, Tabs } from '../../components/ui/Controls';
import { LoadingState, EmptyState } from '../../components/ui/States';
import { Button } from '../../components/ui/Button';

export const CustomerBusinesses = () => {
  const navigate = useNavigate();

  const [activeMode, setActiveMode] = useState('DISCOVER'); // 'DISCOVER' | 'CONNECTED'
  const [businesses, setBusinesses] = useState([]);
  const [connectedBusinesses, setConnectedBusinesses] = useState([]);
  const [allStores, setAllStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const CATEGORIES = [
    'All',
    'Dining',
    'Cafe',
    'Fast Food',
    'Bakery',
    'Grocery',
    'Salon',
  ];

  useEffect(() => {
    loadAllStoresData();
  }, []);

  const loadAllStoresData = async () => {
    setLoading(true);
    try {
      const [homeRes, publicRes] = await Promise.allSettled([
        customerService.getCustomerHome(),
        businessService.getAllBusinesses(),
      ]);

      const homeData = homeRes.status === 'fulfilled' ? homeRes.value : null;
      const connList = (homeData && Array.isArray(homeData.businesses)) ? homeData.businesses : [];
      setConnectedBusinesses(connList);

      const pubList = (publicRes.status === 'fulfilled' && Array.isArray(publicRes.value)) ? publicRes.value : [];

      // Combine and deduplicate
      const seenIds = new Set();
      const combined = [];
      for (const b of [...connList, ...pubList]) {
        if (b?.id && !seenIds.has(b.id)) {
          seenIds.add(b.id);
          combined.push(b);
        }
      }
      setAllStores(combined.length > 0 ? combined : connList);

      // Default to CONNECTED if user has connected stores, otherwise DISCOVER
      if (connList.length > 0) {
        setActiveMode('CONNECTED');
      } else {
        setActiveMode('DISCOVER');
      }
    } catch (e) {
      console.warn('Error loading store list:', e);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredList = () => {
    const sourceList = activeMode === 'CONNECTED' ? connectedBusinesses : allStores;
    const seen = new Set();
    let list = sourceList.filter((b) => {
      if (!b?.id || seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });

    if (category && category !== 'All') {
      const catLower = category.toLowerCase();
      list = list.filter((b) => {
        const bCat = (b.category || '').toLowerCase();
        return bCat.includes(catLower) || (catLower === 'dining' && (bCat.includes('restaurant') || bCat.includes('food') || bCat.includes('cafe')));
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((b) =>
        (b.name && b.name.toLowerCase().includes(q)) ||
        (b.city && b.city.toLowerCase().includes(q)) ||
        (b.category && b.category.toLowerCase().includes(q)) ||
        (b.address && b.address.toLowerCase().includes(q))
      );
    }

    return list;
  };

  const filteredBusinesses = getFilteredList();

  const getStoreMenuUrl = (biz) => {
    if (biz.slug && biz.slug !== 'None' && biz.slug !== 'null') {
      return `/m/${biz.slug}`;
    }
    return `/b/${biz.id}/menu`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1080px', margin: '0 auto', width: '100%', paddingBottom: '2.5rem' }}>
      {/* Header with Mode Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
            Stores & Dining Discovery
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.875rem', margin: '4px 0 0' }}>
            Discover partner stores, explore digital QR menus, reserve dining tables, and earn loyalty perks.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Button
            variant={activeMode === 'CONNECTED' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveMode('CONNECTED')}
            style={{ fontWeight: 700 }}
          >
            My Connected Stores ({connectedBusinesses.length})
          </Button>
          <Button
            variant={activeMode === 'DISCOVER' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveMode('DISCOVER')}
            style={{ fontWeight: 700 }}
          >
            Discover All Stores ({allStores.length})
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={loadAllStoresData}
            title="Refresh stores"
          />
        </div>
      </div>

      {/* Category Pills Filter */}
      <Tabs
        activeTab={category}
        onChange={setCategory}
        tabs={CATEGORIES.map((c) => ({ id: c, label: c }))}
      />

      {/* Search Input */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search stores by name, cuisine, city, or address..."
      />

      {loading ? (
        <LoadingState message="Discovering partner stores and digital menus..." />
      ) : filteredBusinesses.length === 0 ? (
        activeMode === 'CONNECTED' ? (
          <EmptyState
            icon={Store}
            title="No connected stores yet"
            description="You haven't visited or ordered from a store yet. Discover active partner stores below or scan a store table QR code."
            action={
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button
                  variant="primary"
                  onClick={() => setActiveMode('DISCOVER')}
                  icon={Compass}
                  style={{ background: '#1A2B49', color: '#FFFFFF', fontWeight: 700 }}
                >
                  Discover All Partner Stores
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/customer/scan-qr')}
                  icon={QrCode}
                >
                  Scan Store QR Code
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No stores found matching your search"
            description="Try searching with a different keyword or select another category filter."
            action={
              <Button
                variant="outline"
                onClick={() => { setSearch(''); setCategory('All'); }}
              >
                Clear Search Filters
              </Button>
            }
          />
        )
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {filteredBusinesses.map((biz) => {
            const menuUrl = getStoreMenuUrl(biz);
            const coverImg = biz.cover_image || biz.cover_photo_url || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&auto=format&fit=crop&q=80';
            const logoImg = biz.logo || biz.logo_url;
            const categoryText = (biz.category && biz.category !== 'None') ? biz.category : 'Store & Dining';
            const cityText = (biz.city && biz.city !== 'None') ? biz.city : 'Verified Partner';

            return (
              <div
                key={biz.id}
                className="card card-hover"
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1.5px solid #E2E8F0',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '0',
                  overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div>
                  {/* Store Cover Image Banner */}
                  <div style={{ position: 'relative', height: '140px', background: '#F1F5F9' }}>
                    <img
                      src={coverImg}
                      alt={biz.name || 'Store'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                    {logoImg && (
                      <img
                        src={logoImg}
                        alt={biz.name}
                        style={{
                          position: 'absolute',
                          bottom: '-16px',
                          left: '16px',
                          width: '46px',
                          height: '46px',
                          borderRadius: '10px',
                          border: '2px solid #fff',
                          background: '#fff',
                          objectFit: 'cover',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                        }}
                      />
                    )}
                  </div>

                  {/* Store Metadata */}
                  <div style={{ padding: '1.5rem 1.15rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {categoryText}
                      </span>
                      <Badge variant="success" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                        Loyalty Rewards
                      </Badge>
                    </div>

                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1A2B49', margin: '0 0 4px' }}>
                      {biz.name || 'Partner Store'}
                    </h3>

                    {biz.address && biz.address !== 'None' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                        <MapPin size={13} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {biz.address}, {cityText}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div
                  style={{
                    padding: '0.85rem 1.15rem',
                    borderTop: '1px solid #F1F5F9',
                    background: '#FAFAFB',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Button
                    variant="primary"
                    size="sm"
                    icon={UtensilsCrossed}
                    onClick={() => navigate(menuUrl)}
                    style={{
                      flex: 1,
                      background: '#1A2B49',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      borderRadius: '8px',
                      padding: '6px 10px',
                    }}
                  >
                    View Menu
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Calendar}
                    onClick={() => navigate(`/customer/table-booking?business_id=${biz.id}`)}
                    style={{
                      flex: 1,
                      borderColor: '#CBD5E1',
                      color: '#1A2B49',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      borderRadius: '8px',
                      padding: '6px 10px',
                    }}
                  >
                    Book Table
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomerBusinesses;
