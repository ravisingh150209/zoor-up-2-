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

// In-flight GET request deduplication cache to prevent duplicate waterfalls
const inFlightRequests = new Map();

/**
 * Fetch wrapper with finite request timeout and automatic in-flight deduplication for GET requests
 */
export const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const token = authStorage.getToken() || '';
  const cacheKey = isGet ? `${url}__${token}` : null;

  if (isGet && inFlightRequests.has(cacheKey)) {
    try {
      const cachedRes = await inFlightRequests.get(cacheKey);
      return cachedRes.clone();
    } catch (_) {
      // If cached response body was already consumed, bypass cache
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error('REQUEST_TIMEOUT'));
  }, timeoutMs);

  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      controller.abort();
    });
  }

  const startTime = Date.now();
  const fetchPromise = (async () => {
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      const duration = Date.now() - startTime;
      if (typeof window !== 'undefined' && window.__ZOORUP_DEBUG__) {
        console.log(`[API ${method}] ${url} -> ${res.status} (${duration}ms)`);
      }
      return res;
    } catch (err) {
      const duration = Date.now() - startTime;
      if (err.name === 'AbortError' || err.message === 'REQUEST_TIMEOUT') {
        console.warn(`[API TIMEOUT] ${method} ${url} exceeded ${timeoutMs}ms (${duration}ms)`);
        throw new Error('Request timed out. Please check your connection.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (cacheKey) {
        inFlightRequests.delete(cacheKey);
      }
    }
  })();

  if (isGet) {
    inFlightRequests.set(cacheKey, fetchPromise);
  }

  const finalRes = await fetchPromise;
  return isGet ? finalRes.clone() : finalRes;
};

export const safeFetchJson = async (url, options = {}, timeoutMs = 12000) => {
  const finalHeaders = {
    ...getRequestHeaders(),
    ...(options.headers || {})
  };
  const res = await fetchWithTimeout(url, { ...options, headers: finalHeaders }, timeoutMs);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawText = await res.text();
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Session expired. Please log in again.');
      }
      throw new Error(`API error ${res.status}: ${rawText.slice(0, 100)}`);
    }
    return { success: true, text: rawText };
  }
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Session expired. Please log in again.');
    }
    throw new Error(data.detail || data.message || `Request failed with status ${res.status}`);
  }
  return data;
};

