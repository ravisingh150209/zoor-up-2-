import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  Plus,
  Minus,
  MapPin,
  Clock,
  Phone,
  Search,
  Check,
  Star,
  ChevronRight,
  ArrowRight,
  Store,
  AlertTriangle,
  RefreshCw,
  UtensilsCrossed,
  Info
} from 'lucide-react';
import { businessService } from '../../services/businessService';
import { productService } from '../../services/productService';
import { qrService } from '../../services/qrService';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/States';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { useToast } from '../../context/ToastContext';

import { API_BASE_URL as API_BASE } from '../../config/api.js';

export const PublicQRMenu = ({ slug: propSlug, business: propBusiness, catalogData: propCatalogData }) => {
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const rawIdentifier = propSlug || params.slug || params.businessId || '';
  const slug = (rawIdentifier && rawIdentifier !== 'undefined' && rawIdentifier !== 'null' && rawIdentifier !== 'None')
    ? String(rawIdentifier).trim()
    : (propBusiness?.id || '');

  const {
    items: cartItems,
    businessId: cartBusinessId,
    businessName: cartBusinessName,
    addItem,
    clearAndAddItem,
    updateQuantity,
    subtotal,
    totalCount
  } = useCart();

  const [business, setBusiness] = useState(propBusiness || null);
  const [products, setProducts] = useState(
    propCatalogData?.menu?.items || propCatalogData?.products || []
  );
  const [categories, setCategories] = useState(['ALL']);
  const [loading, setLoading] = useState(!propBusiness);
  const [errorType, setErrorType] = useState(null); // 'NOT_FOUND' | 'NETWORK_ERROR' | 'INVALID_QR'
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [conflictModalItem, setConflictModalItem] = useState(null);

  // Synchronize when propBusiness or propCatalogData updates
  useEffect(() => {
    if (propBusiness) {
      setBusiness(propBusiness);
      const menuItems = propCatalogData?.menu?.items || propCatalogData?.products || [];
      if (menuItems.length > 0) {
        setProducts(menuItems);
        const cats = ['ALL', ...new Set(menuItems.map((p) => p.category).filter(Boolean))];
        setCategories(cats);
        setLoading(false);
      }
    }
  }, [propBusiness, propCatalogData]);

  // Connect authenticated customer idempotently to the business
  useEffect(() => {
    if (user && (user.role === 'customer' || user.role === 'CUSTOMER') && business?.id) {
      qrService.connectBusiness(business.id, 'menu').catch(() => {});
    }
  }, [user, business?.id]);

  useEffect(() => {
    if (slug) {
      loadStoreData();
    } else if (!propBusiness) {
      setErrorType('INVALID_QR');
      setLoading(false);
    }
  }, [slug]);

  const loadStoreData = async () => {
    if (!slug) {
      if (!propBusiness) {
        setErrorType('INVALID_QR');
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setErrorType(null);
    let isNetworkError = false;

    try {
      // 1. Try public menu endpoint from backend
      const resp = await fetch(`${API_BASE}/api/public/menu/${encodeURIComponent(slug)}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data?.business) {
          setBusiness(data.business);
          const menuItems = data.menu?.items || data.products || [];
          setProducts(menuItems);

          // Extract categories
          const cats = ['ALL', ...new Set(menuItems.map((p) => p.category).filter(Boolean))];
          setCategories(cats);
          setLoading(false);
          return;
        }
      } else if (resp.status >= 500) {
        isNetworkError = true;
      }
    } catch (err) {
      console.warn('[ZOOR UP MENU] Network fetch error:', err);
      isNetworkError = true;
    }

    // 2. Client-side fallback
    try {
      let biz = await businessService.getBusinessBySlug(slug);
      if (!biz && slug) {
        biz = await businessService.getBusiness(slug);
      }

      if (biz) {
        const prods = await productService.getProducts(biz.id);
        setBusiness(biz);
        setProducts(prods || []);
        const cats = ['ALL', ...new Set((prods || []).map((p) => p.category).filter(Boolean))];
        setCategories(cats);
        setErrorType(null);
      } else {
        setBusiness(null);
        setProducts([]);
        setErrorType(isNetworkError ? 'NETWORK_ERROR' : 'NOT_FOUND');
      }
    } catch (e) {
      console.error('[ZOOR UP MENU] Error loading store data:', e);
      setBusiness(null);
      setErrorType(isNetworkError ? 'NETWORK_ERROR' : 'NOT_FOUND');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = (product) => {
    const isAvail = product.available !== false && product.active !== false;
    if (!isAvail) {
      addToast('This item is currently unavailable.', 'warning');
      return;
    }

    const res = addItem(product, business?.id, business?.slug, business?.name);
    if (res?.conflict) {
      setConflictModalItem(product);
    } else {
      addToast(`Added "${product.name}" to cart`, 'success');
    }
  };

  const handleResolveConflictAndAdd = () => {
    if (conflictModalItem && business) {
      clearAndAddItem(conflictModalItem, business.id, business.slug, business.name);
      addToast(`Cart cleared and "${conflictModalItem.name}" added`, 'success');
      setConflictModalItem(null);
    }
  };

  if (loading) {
    return <LoadingState message="Loading digital menu..." fullPage />;
  }

  if (errorType === 'NETWORK_ERROR') {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <AlertTriangle size={52} style={{ color: '#F59E0B', marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49' }}>Unable to connect. Please try again.</h2>
        <p style={{ color: '#64748B', fontSize: '0.85rem', maxWidth: '380px', margin: '0.35rem auto 1.5rem' }}>
          We could not reach the store menu server. Please check your internet connection and try again.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={loadStoreData} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <RefreshCw size={16} /> Retry Connection
          </button>
          <Link to="/" className="btn btn-secondary">
            Go to ZOOR UP Home
          </Link>
        </div>
      </div>
    );
  }

  if (errorType === 'INVALID_QR') {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <AlertTriangle size={52} style={{ color: '#EF4444', marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49' }}>Invalid ZOOR UP QR code.</h2>
        <p style={{ color: '#64748B', fontSize: '0.85rem', maxWidth: '380px', margin: '0.35rem auto 1.5rem' }}>
          The scanned code does not contain a recognized store link or business identifier.
        </p>
        <Link to="/" className="btn btn-secondary">
          Go to ZOOR UP Home
        </Link>
      </div>
    );
  }

  if (!business) {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <Store size={52} style={{ color: '#94A3B8', marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49' }}>Business not found.</h2>
        <p style={{ color: '#64748B', fontSize: '0.85rem', maxWidth: '380px', margin: '0.35rem auto 1.5rem' }}>
          The requested store menu could not be resolved from this QR link or slug.
        </p>
        <Link to="/" className="btn btn-secondary">
          Go to ZOOR UP Home
        </Link>
      </div>
    );
  }

  if (business.menu_enabled === false) {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <UtensilsCrossed size={52} style={{ color: '#94A3B8', marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49' }}>Digital menu is currently unavailable.</h2>
        <p style={{ color: '#64748B', fontSize: '0.85rem', maxWidth: '380px', margin: '0.35rem auto 1.5rem' }}>
          This business has currently paused their digital menu offerings.
        </p>
        <Link to="/" className="btn btn-secondary">
          Go to ZOOR UP Home
        </Link>
      </div>
    );
  }

  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchSearch =
      !search ||
      (p.name && p.name.toLowerCase().includes(search.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const getItemCartQty = (productId) => {
    const item = cartItems.find((i) => i.id === productId);
    return item ? item.quantity : 0;
  };

  const businessLogo = business.logo_url || business.logo;
  const businessCover = business.cover_photo_url || business.cover_image;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas, #F8FAFC)',
        maxWidth: '680px',
        margin: '0 auto',
        boxShadow: '0 0 25px rgba(0, 0, 0, 0.05)',
        position: 'relative',
        paddingBottom: totalCount > 0 ? '5.5rem' : '2.5rem',
      }}
    >
      {/* Top Banner / Cover */}
      <div
        style={{
          height: '140px',
          background: businessCover
            ? `linear-gradient(rgba(11, 15, 25, 0.4), rgba(11, 15, 25, 0.7)), url(${businessCover}) center/cover no-repeat`
            : 'linear-gradient(135deg, #1A2B49 0%, #2A4365 100%)',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: '14px', left: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ZoorUpLogo size="xs" width={24} height={24} priority />
          <span style={{ color: '#FFFFFF', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.04em' }}>
            ZOOR UP MENU
          </span>
        </div>
      </div>

      {/* Business Header Card */}
      <div
        style={{
          margin: '-45px 1rem 1rem',
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '1.25rem',
          border: '1px solid #E2E8F0',
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.04)',
          position: 'relative',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
        }}
      >
        {businessLogo ? (
          <img
            src={businessLogo}
            alt={business.name}
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '16px',
              objectFit: 'cover',
              border: '2px solid #FFFFFF',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.08)',
              flexShrink: 0,
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '16px',
              background: '#FEF3C7',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.5rem',
              flexShrink: 0,
              border: '1px solid #FDE68A',
            }}
          >
            {business.name?.charAt(0) || 'S'}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
              {business.name}
            </h1>
            <Badge variant="success" style={{ fontSize: '0.7rem' }}>OPEN</Badge>
          </div>
          <p style={{ color: '#64748B', fontSize: '0.8rem', margin: '3px 0 0', fontWeight: 500 }}>
            {business.category || 'Dining & Retail'} • {business.city || 'India'}
          </p>
          {business.address && (
            <p style={{ color: '#94A3B8', fontSize: '0.72rem', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={12} /> {business.address}
            </p>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div style={{ padding: '0 1rem 0.75rem' }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
          />
          <input
            type="text"
            placeholder="Search food, beverages, items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem 0.65rem 2.25rem',
              borderRadius: '12px',
              border: '1px solid #CBD5E1',
              fontSize: '0.85rem',
              background: '#FFFFFF',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Horizontal Category Filter Pills */}
      {categories.length > 1 && (
        <div style={{ padding: '0 1rem 0.85rem' }}>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              overflowX: 'auto',
              padding: '0.25rem 0',
              scrollbarWidth: 'none',
            }}
          >
            {categories.map((cat) => {
              const isSel = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    background: isSel ? '#1A2B49' : '#FFFFFF',
                    color: isSel ? '#FFFFFF' : '#1A2B49',
                    border: `1px solid ${isSel ? '#1A2B49' : '#E2E8F0'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {cat === 'ALL' ? 'All Items' : cat}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Products & Services Catalog Grid */}
      <div style={{ padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {filteredProducts.length === 0 ? (
          <div
            style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
            }}
          >
            <UtensilsCrossed size={42} style={{ color: '#94A3B8', margin: '0 auto 0.75rem' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1A2B49', margin: '0 0 0.35rem' }}>
              {products.length === 0
                ? "This business hasn't added any menu items yet."
                : 'No items match your filter.'}
            </h3>
            <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>
              {products.length === 0
                ? 'Check back soon once the store publishes their digital menu.'
                : 'Try selecting another category or clearing your search.'}
            </p>
          </div>
        ) : (
          filteredProducts.map((p) => {
            const qty = getItemCartQty(p.id);
            const isAvailable = p.available !== false && p.active !== false;

            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  gap: '0.85rem',
                  padding: '0.85rem',
                  alignItems: 'center',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
                  opacity: isAvailable ? 1 : 0.7,
                }}
              >
                {/* Product Image */}
                {(p.image_url || p.image) ? (
                  <img
                    src={p.image_url || p.image}
                    alt={p.name}
                    style={{
                      width: '84px',
                      height: '84px',
                      borderRadius: '12px',
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '84px',
                      height: '84px',
                      borderRadius: '12px',
                      background: '#FEF3C7',
                      color: '#D97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      border: '1px solid #FDE68A',
                    }}
                  >
                    <ShoppingBag size={28} />
                  </div>
                )}

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                      {p.category}
                    </span>
                    {!isAvailable && (
                      <Badge variant="warning" style={{ fontSize: '0.65rem' }}>Unavailable</Badge>
                    )}
                  </div>

                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1A2B49', margin: '0 0 2px', lineHeight: 1.3 }}>
                    {p.name}
                  </h4>

                  {p.description && (
                    <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0 0 6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {p.description}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem' }}>
                    <strong style={{ fontSize: '1rem', color: '#1A2B49' }}>
                      ₹{p.discount_price || p.price}
                    </strong>
                    {p.discount_price && p.discount_price < p.price && (
                      <span style={{ fontSize: '0.78rem', textDecoration: 'line-through', color: '#94A3B8' }}>
                        ₹{p.price}
                      </span>
                    )}
                  </div>
                </div>

                {/* Add / Quantity Controls */}
                <div style={{ flexShrink: 0 }}>
                  {!isAvailable ? (
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600 }}>
                      Sold Out
                    </span>
                  ) : qty === 0 ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleAddToCart(p)}
                      style={{ borderRadius: '999px', padding: '0.35rem 0.9rem', fontSize: '0.8rem', background: '#1A2B49' }}
                    >
                      + ADD
                    </Button>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: '#FEF3C7',
                        border: '1px solid #FDE68A',
                        borderRadius: '999px',
                        padding: '2px 6px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => updateQuantity(p.id, -1)}
                        style={{ padding: '4px', color: '#B45309', cursor: 'pointer', background: 'transparent', border: 'none' }}
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, minWidth: '18px', textAlign: 'center', color: '#B45309' }}>
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(p.id, 1)}
                        style={{ padding: '4px', color: '#B45309', cursor: 'pointer', background: 'transparent', border: 'none' }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Powered by ZOOR UP Footer */}
      <div style={{ textAlign: 'center', padding: '2.5rem 1rem 4.5rem', color: '#94A3B8' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Powered by</span>
          <ZoorUpLogo size="xs" width={22} height={22} priority />
          <strong style={{ color: '#1A2B49', letterSpacing: '-0.02em', fontSize: '0.9rem' }}>
            ZOOR <span style={{ color: '#F59E0B' }}>UP</span>
          </strong>
        </div>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>Digital QR Standee & Smart Menu SaaS</p>
      </div>

      {/* Sticky Bottom Cart Bar */}
      {totalCount > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '12px',
            left: '12px',
            right: '12px',
            maxWidth: '656px',
            margin: '0 auto',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#1A2B49',
              borderRadius: '16px',
              padding: '0.85rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#FFFFFF',
              boxShadow: '0 8px 24px rgba(26, 43, 73, 0.25)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', opacity: 0.8 }}>
                  {totalCount} {totalCount === 1 ? 'item' : 'items'}
                </span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>₹{subtotal}</span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Plus applicable store taxes</span>
            </div>

            <Button
              variant="accent"
              size="sm"
              onClick={() => navigate('/checkout')}
              icon={ArrowRight}
              style={{
                borderRadius: '10px',
                padding: '0.55rem 1.15rem',
                fontWeight: 700,
                fontSize: '0.85rem',
                background: '#F59E0B',
                color: '#1A2B49',
              }}
            >
              View Cart
            </Button>
          </div>
        </div>
      )}

      {/* Cross-Business Cart Conflict Modal */}
      {conflictModalItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '1.75rem',
              maxWidth: '420px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}
            >
              <AlertTriangle size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1A2B49', margin: '0 0 0.5rem' }}>
              Your cart belongs to another business
            </h3>
            <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '0 0 1.5rem', lineHeight: 1.4 }}>
              Your cart already contains items from {cartBusinessName || 'another store'}. A cart can only contain items from one business at a time.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Button
                variant="primary"
                fullWidth
                onClick={handleResolveConflictAndAdd}
                style={{ background: '#1A2B49' }}
              >
                Clear Cart & Continue
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setConflictModalItem(null)}
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
