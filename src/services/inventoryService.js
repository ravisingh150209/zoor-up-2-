import { productService } from './productService.js';

export const inventoryService = {
  getInventorySummary: async (businessId) => {
    await new Promise(r => setTimeout(r, 100));
    if (!businessId) {
      return {
        totalProducts: 0,
        availableStock: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        totalStockValue: 0,
        lowStockItems: [],
        outOfStockItems: [],
        products: [],
      };
    }
    const products = (await productService.getProducts(businessId)).filter(p => p.type === 'product');
    
    const totalProducts = products.length;
    const availableStock = products.reduce((acc, p) => acc + (p.stock || 0), 0);
    const lowStockItems = products.filter(p => p.stock > 0 && p.stock <= 5);
    const outOfStockItems = products.filter(p => p.stock === 0);
    const totalStockValue = products.reduce((acc, p) => acc + ((p.stock || 0) * (p.discount_price || p.price)), 0);

    return {
      totalProducts,
      availableStock,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      totalStockValue,
      lowStockItems,
      outOfStockItems,
      products,
    };
  }
};
