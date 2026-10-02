import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [businessId, setBusinessId] = useState('');
  const [businessSlug, setBusinessSlug] = useState('');
  const [businessName, setBusinessName] = useState('');

  // Load from local storage if available
  useEffect(() => {
    try {
      const stored = localStorage.getItem('zoorup_cart');
      if (stored) {
        const parsed = JSON.parse(stored);
        setItems(parsed.items || []);
        setBusinessId(parsed.businessId || '');
        setBusinessSlug(parsed.businessSlug || '');
        setBusinessName(parsed.businessName || '');
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const saveCart = (newItems, bId, slug, bName) => {
    setItems(newItems);
    const finalBId = bId !== undefined ? bId : businessId;
    const finalSlug = slug !== undefined ? slug : businessSlug;
    const finalBName = bName !== undefined ? bName : businessName;

    if (finalBId !== undefined) setBusinessId(finalBId);
    if (finalSlug !== undefined) setBusinessSlug(finalSlug);
    if (finalBName !== undefined) setBusinessName(finalBName);

    localStorage.setItem('zoorup_cart', JSON.stringify({
      items: newItems,
      businessId: finalBId,
      businessSlug: finalSlug,
      businessName: finalBName,
    }));
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
      nextItems[existingIndex].quantity += 1;
    } else {
      nextItems.push({
        id: product.id,
        name: product.name,
        price: product.discount_price || product.price,
        original_price: product.price,
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
      price: product.discount_price || product.price,
      original_price: product.price,
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
          const qty = item.quantity + delta;
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
    saveCart([], '', '', '');
  };

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        businessId,
        businessSlug,
        businessName,
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
