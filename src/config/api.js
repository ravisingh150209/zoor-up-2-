/**
 * Centralized API Configuration for ZOOR UP
 * Provides standard backend API URL resolution across Web, Firebase Hosting, and Android APK.
 */
import { authStorage } from '../auth/authStorage.js';

export const getApiBaseUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }
  return 'https://zoor-up-2.onrender.com';
};

export const API_BASE_URL = getApiBaseUrl();

export const getApiUrl = (endpoint) => {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
};

export const getRequestHeaders = (extraHeaders = {}) => {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...authStorage.getAuthHeaders(),
    ...extraHeaders
  };
};

export const safeFetchJson = async (url, options = {}) => {
  const finalHeaders = {
    ...getRequestHeaders(),
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers: finalHeaders });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${rawText.slice(0, 100)}`);
    }
    return { success: true, text: rawText };
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || `Request failed with status ${res.status}`);
  }
  return data;
};
