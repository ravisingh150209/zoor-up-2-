import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);

const readStoredCart = () => {
  if (typeof localStorage === 'undefined') {
    return { items: [], businessId: '', businessSlug: '', businessName: '', tableId: '' };
  }
  try {
    const stored = localStorage.getItem('zoorup_cart');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        businessId: parsed.businessId || '',
        businessSlug: parsed.businessSlug || '',
        businessName: parsed.businessName || '',
        tableId: parsed.tableId || '',
      };
    }
  } catch (e) {
    console.warn('[CART STORAGE] Parse error:', e);
  }
  return { items: [], businessId: '', businessSlug: '', businessName: '', tableId: '' };
};

export const CartProvider = ({ children }) => {
  const [initialCart] = useState(readStoredCart);
  const [items, setItems] = useState(initialCart.items);
  const [businessId, setBusinessId] = useState(initialCart.businessId);
  const [businessSlug, setBusinessSlug] = useState(initialCart.businessSlug);
  const [businessName, setBusinessName] = useState(initialCart.businessName);
  const [tableId, setTableId] = useState(initialCart.tableId);

  // Synchronize across tabs or native WebView storage injections
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'zoorup_cart') {
        if (!e.newValue) {
          setItems([]);
          setBusinessId('');
          setBusinessSlug('');
          setBusinessName('');
          setTableId('');
          return;
        }
        try {
          const parsed = JSON.parse(e.newValue);
          setItems(Array.isArray(parsed.items) ? parsed.items : []);
          if (parsed.businessId !== undefined) setBusinessId(parsed.businessId);
          if (parsed.businessSlug !== undefined) setBusinessSlug(parsed.businessSlug);
          if (parsed.businessName !== undefined) setBusinessName(parsed.businessName);
          if (parsed.tableId !== undefined) setTableId(parsed.tableId);
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const saveCart = (newItems, bId, slug, bName, tblId) => {
    setItems(newItems);
    const finalBId = bId !== undefined ? bId : businessId;
    const finalSlug = slug !== undefined ? slug : businessSlug;
    const finalBName = bName !== undefined ? bName : businessName;
    const finalTableId = tblId !== undefined ? tblId : tableId;

    if (finalBId !== undefined) setBusinessId(finalBId);
    if (finalSlug !== undefined) setBusinessSlug(finalSlug);
    if (finalBName !== undefined) setBusinessName(finalBName);
    if (finalTableId !== undefined) setTableId(finalTableId);

    try {
      localStorage.setItem('zoorup_cart', JSON.stringify({
        items: newItems,
        businessId: finalBId,
        businessSlug: finalSlug,
        businessName: finalBName,
        tableId: finalTableId,
      }));
    } catch (err) {
      console.warn('[CART] Failed to write localStorage:', err);
    }
  };

  /**
   * Adds an item to the cart.
   * If cart has items from another business, returns { conflict: true, currentBusinessName, currentBusinessId }
   */
  const addItem = (product, targetBizId = null, slug = null, bName = null) => {
    const itemBizId = targetBizId || product.business_id;

    // Multi-tenant cart isolation check:
    if (items.length > 0 && businessId && itemBizId && businessId !== itemBizId) {
      return {
        conflict: true,
        currentBusinessId: businessId,
        currentBusinessName: businessName || 'another store',
        newBusinessId: itemBizId,
      };
    }

    let nextItems = [...items];
    const existingIndex = nextItems.findIndex(i => i.id === product.id);

    if (existingIndex > -1) {
      nextItems[existingIndex].quantity = (Number(nextItems[existingIndex].quantity) || 0) + 1;
    } else {
      nextItems.push({
        id: product.id,
        name: product.name,
        price: Number(product.discount_price || product.price) || 0,
        original_price: Number(product.price) || 0,
        image: product.image_url || product.image,
        type: product.type || 'product',
        category: product.category || 'General',
        business_id: itemBizId,
        quantity: 1,
      });
    }

    saveCart(nextItems, itemBizId || businessId, slug || businessSlug, bName || businessName);
    return { success: true };
  };

  const clearAndAddItem = (product, targetBizId = null, slug = null, bName = null) => {
    const itemBizId = targetBizId || product.business_id;
    const newItem = {
      id: product.id,
      name: product.name,
      price: Number(product.discount_price || product.price) || 0,
      original_price: Number(product.price) || 0,
      image: product.image_url || product.image,
      type: product.type || 'product',
      category: product.category || 'General',
      business_id: itemBizId,
      quantity: 1,
    };
    saveCart([newItem], itemBizId, slug, bName);
    return { success: true };
  };

  const updateQuantity = (productId, delta) => {
    let nextItems = items
      .map(item => {
        if (item.id === productId) {
          const qty = (Number(item.quantity) || 0) + delta;
          return qty > 0 ? { ...item, quantity: qty } : null;
        }
        return item;
      })
      .filter(Boolean);

    if (nextItems.length === 0) {
      saveCart([], '', '', '');
    } else {
      saveCart(nextItems, businessId, businessSlug, businessName);
    }
  };

  const removeItem = (productId) => {
    const nextItems = items.filter(i => i.id !== productId);
    if (nextItems.length === 0) {
      saveCart([], '', '', '');
    } else {
      saveCart(nextItems, businessId, businessSlug, businessName);
    }
  };

  const clearCart = () => {
    saveCart([], '', '', '', '');
  };

  const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const totalCount = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  return (
    <CartContext.Provider
      value={{
        items,
        businessId,
        businessSlug,
        businessName,
        tableId,
        setTableId,
        setBusinessSlug,
        setBusinessId,
        setBusinessName,
        addItem,
        clearAndAddItem,
        updateQuantity,
        removeItem,
        clearCart,
        subtotal,
        totalCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
