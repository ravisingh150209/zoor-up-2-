import { getApiUrl, safeFetchJson } from '../config/api.js';
import { localDB, isProductionEnvironment } from './storageSeed.js';

export const chatService = {
  getConversations: async (businessId) => {
    try {
      const url = getApiUrl('/api/chat/conversations');
      const data = await safeFetchJson(url);
      if (data && Array.isArray(data.conversations)) {
        return data.conversations;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[CHAT] API getConversations failed, falling back in dev', e);
    }

    if (!businessId) return [];
    const messages = localDB.getMessages().filter(m => m.business_id === businessId);
    const customers = localDB.getCustomers();

    // Group by customer_id
    const customerMap = {};
    messages.forEach(msg => {
      if (!customerMap[msg.customer_id]) {
        const cus = customers.find(c => c.customer_id === msg.customer_id);
        customerMap[msg.customer_id] = {
          customerId: msg.customer_id,
          customerName: cus ? cus.name : 'Customer',
          customerAvatar: cus ? cus.avatar : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
          lastMessage: msg.text,
          lastTimestamp: msg.timestamp,
          unreadCount: (!msg.is_read && msg.sender_role === 'customer') ? 1 : 0,
        };
      } else {
        customerMap[msg.customer_id].lastMessage = msg.text;
        customerMap[msg.customer_id].lastTimestamp = msg.timestamp;
        if (!msg.is_read && msg.sender_role === 'customer') {
          customerMap[msg.customer_id].unreadCount += 1;
        }
      }
    });

    return Object.values(customerMap).sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));
  },

  getMessages: async (businessId, customerId) => {
    try {
      const params = new URLSearchParams();
      if (customerId) params.append('customer_id', customerId);
      if (businessId) params.append('business_id', businessId);
      const url = getApiUrl(`/api/chat/messages?${params.toString()}`);
      const data = await safeFetchJson(url);
      if (data && Array.isArray(data.messages)) {
        return data.messages;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[CHAT] API getMessages failed, falling back in dev', e);
    }

    const messages = localDB.getMessages();
    return messages.filter(m => m.business_id === businessId && m.customer_id === customerId);
  },

  sendMessage: async ({ businessId, customerId, sender_role, sender_name, text }) => {
    try {
      const url = getApiUrl('/api/chat/messages');
      const res = await safeFetchJson(url, {
        method: 'POST',
        body: JSON.stringify({
          business_id: businessId,
          customer_id: customerId,
          sender_role: sender_role || 'business',
          sender_name: sender_name || 'Store Manager',
          text
        })
      });
      if (res && res.message) {
        return res.message;
      }
    } catch (e) {
      if (isProductionEnvironment()) throw e;
      console.warn('[CHAT] API sendMessage failed, falling back in dev', e);
    }

    const messages = localDB.getMessages();
    const newMsg = {
      id: `msg_${Date.now()}`,
      business_id: businessId,
      customer_id: customerId,
      sender_role,
      sender_name,
      text,
      timestamp: new Date().toISOString(),
      is_read: true,
    };
    messages.push(newMsg);
    localDB.saveMessages(messages);
    return newMsg;
  }
};
