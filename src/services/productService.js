import { isProductionEnvironment, localDB } from './storageSeed.js';
import { authStorage } from '../auth/authStorage.js';
import { API_BASE_URL as API_BASE } from '../config/api.js';

const getAuthHeaders = () => {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...authStorage.getAuthHeaders()
  };
};

export const productService = {
  getProducts: async (businessId, filters = {}) => {
    if (!businessId) return [];

    let list = [];

    // 1. Try public menu / business products API
    try {
      const resp = await fetch(`${API_BASE}/api/public/menu/${encodeURIComponent(businessId)}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.menu?.items && Array.isArray(data.menu.items)) {
          list = data.menu.items;
          if (!isProductionEnvironment()) {
            const existing = localDB.getProducts().filter(p => p.business_id !== businessId);
            localDB.saveProducts([...existing, ...list]);
          }
        }
      }
      if (!resp.ok) throw new Error('Unable to load products from the server.');
    } catch (error) {
      if (isProductionEnvironment()) throw error;
    }

    // 2. Fallback to localDB if API failed or returned empty
    if (list.length === 0 && !isProductionEnvironment()) {
      list = localDB.getProducts().filter(p => p.business_id === businessId);
    }

    if (filters.type && filters.type !== 'ALL') {
      list = list.filter(p => p.type === filters.type);
    }

    if (filters.category && filters.category !== 'ALL') {
      list = list.filter(p => p.category.toLowerCase() === filters.category.toLowerCase());
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.includes(q))
      );
    }

    if (filters.stockStatus === 'LOW_STOCK') {
      list = list.filter(p => p.type === 'product' && p.stock <= 5 && p.stock > 0);
    } else if (filters.stockStatus === 'OUT_OF_STOCK') {
      list = list.filter(p => p.type === 'product' && p.stock === 0);
    }

    return list;
  },

  getProductById: async (id) => {
    if (isProductionEnvironment()) {
      const businessId = authStorage.getUser()?.business_id;
      if (!businessId) throw new Error('Authenticated business context is required.');
      const response = await fetch(`${API_BASE}/api/business/${encodeURIComponent(businessId)}/products`, {
        headers: getAuthHeaders(),
      });
      const products = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(products.detail || 'Unable to load this product.');
      return products.find(product => product.id === id) || null;
    }
    const list = localDB.getProducts();
    return list.find(p => p.id === id) || null;
  },

  addProduct: async (businessId, itemData) => {
    const activeImage = itemData.image_url || itemData.image || null;
    const payload = {
      name: itemData.name,
      category: itemData.category || 'General',
      price: Number(itemData.price),
      discount_price: itemData.discount_price ? Number(itemData.discount_price) : Number(itemData.price),
      stock: itemData.type === 'service' ? 999 : Number(itemData.stock || 50),
      sku: itemData.sku || `SKU-${Date.now().toString(36).toUpperCase()}`,
      barcode: itemData.barcode || `${Date.now()}`,
      type: itemData.type || 'product',
      image: activeImage,
      image_url: activeImage,
      active: itemData.active !== undefined ? Boolean(itemData.active) : true,
      description: itemData.description || '',
    };

    // 1. Try Backend API
    try {
      const resp = await fetch(`${API_BASE}/api/business/${encodeURIComponent(businessId)}/products`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const created = await resp.json();
        return created;
      }
      const error = await resp.json().catch(() => ({}));
      if (isProductionEnvironment()) throw new Error(error.detail || 'Product creation failed.');
    } catch (_) {}

    if (isProductionEnvironment()) throw new Error('Product service is unavailable. No local product was created.');

    // 2. Local fallback
    const list = localDB.getProducts();
    const newProduct = {
      ...payload,
      id: `prod_${Date.now()}`,
      business_id: businessId,
      created_at: new Date().toISOString(),
    };

    list.unshift(newProduct);
    localDB.saveProducts(list);
    return newProduct;
  },

  updateProduct: async (id, updates, callerContext = null) => {
    if (isProductionEnvironment()) {
      const businessId = callerContext?.callerBusinessId || authStorage.getUser()?.business_id;
      if (!businessId) throw new Error('Authenticated business context is required.');
      if (callerContext?.callerBusinessId && callerContext.callerBusinessId !== businessId) {
        throw new Error('You can only update products in your authenticated business.');
      }
      const finalUpdates = { ...updates };
      if (finalUpdates.image_url !== undefined) finalUpdates.image = finalUpdates.image_url;
      else if (finalUpdates.image !== undefined) finalUpdates.image_url = finalUpdates.image;
      const response = await fetch(`${API_BASE}/api/business/${encodeURIComponent(businessId)}/products/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(finalUpdates),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Product update failed.');
      return result;
    }
    const list = localDB.getProducts();
    const idx = list.findIndex(p => p.id === id);
    const businessId = list[idx]?.business_id;

    // Cross-Tenant check
    if (callerContext?.callerBusinessId && callerContext.callerBusinessId !== businessId) {
      throw new Error(`Unauthorized: Business ${callerContext.callerBusinessId} cannot update product in Business ${businessId}`);
    }

    const finalUpdates = { ...updates };
    if (finalUpdates.image_url !== undefined) {
      finalUpdates.image = finalUpdates.image_url;
    } else if (finalUpdates.image !== undefined) {
      finalUpdates.image_url = finalUpdates.image;
    }

    // Try backend API
    if (businessId) {
      try {
        const resp = await fetch(`${API_BASE}/api/business/${encodeURIComponent(businessId)}/products/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(finalUpdates),
        });
        if (resp.ok) {
          const updated = await resp.json();
          if (idx !== -1) {
            list[idx] = updated;
            localDB.saveProducts(list);
          }
          return updated;
        }
      } catch (_) {}
    }

    if (idx !== -1) {
      list[idx] = { ...list[idx], ...finalUpdates, updated_at: new Date().toISOString() };
      localDB.saveProducts(list);
      return list[idx];
    }
    throw new Error('Product not found');
  },

  deleteProduct: async (id) => {
    if (isProductionEnvironment()) {
      const businessId = authStorage.getUser()?.business_id;
      if (!businessId) throw new Error('Authenticated business context is required.');
      const response = await fetch(`${API_BASE}/api/business/${encodeURIComponent(businessId)}/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Product deletion failed.');
      return true;
    }
    const list = localDB.getProducts();
    const item = list.find(p => p.id === id);
    const businessId = item?.business_id;

    if (businessId) {
      try {
        await fetch(`${API_BASE}/api/business/${encodeURIComponent(businessId)}/products/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
      } catch (_) {}
    }

    const filtered = list.filter(p => p.id !== id);
    localDB.saveProducts(filtered);
    return true;
  },

  adjustStock: async (productId, delta, reason = 'ADJUSTMENT') => {
    if (isProductionEnvironment()) {
      const businessId = authStorage.getUser()?.business_id;
      if (!businessId) throw new Error('Authenticated business context is required.');
      const products = await productService.getProducts(businessId);
      const product = products.find(item => item.id === productId);
      if (!product) throw new Error('Product not found for stock adjustment.');
      return productService.updateProduct(productId, {
        stock: Math.max(0, Number(product.stock || 0) + Number(delta)),
        stock_adjustment_reason: reason,
      }, { callerBusinessId: businessId });
    }
    const list = localDB.getProducts();
    const idx = list.findIndex(p => p.id === productId);
    if (idx !== -1) {
      const current = list[idx].stock || 0;
      const updatedStock = Math.max(0, current + Number(delta));
      list[idx].stock = updatedStock;
      localDB.saveProducts(list);
      return list[idx];
    }
    throw new Error('Product not found for stock adjustment');
  }
};
