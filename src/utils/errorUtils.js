const sanitizeErrorMessage = (msg, fallback) => {
  if (!msg || typeof msg !== 'string') return fallback;
  const clean = msg.trim();
  if (
    clean.includes('Errno 11') ||
    clean.includes('Resource temporarily unavailable') ||
    clean.includes('EAGAIN') ||
    clean.includes('EWOULDBLOCK') ||
    clean.includes('Database resource temporarily unavailable') ||
    clean.includes('temporarily unavailable')
  ) {
    return 'Loyalty service is temporarily updating. Please tap Retry.';
  }
  if (clean.includes('Failed to fetch') || clean.includes('NetworkError') || clean.includes('Load failed')) {
    return 'Connection temporarily interrupted. Please tap Retry.';
  }
  return clean;
};

/**
 * Safe error message extractor for ZOOR UP
 * Prevents [object Object] errors in UI
 */
export const getErrorMessage = (error, fallback = 'An unexpected error occurred') => {
  if (!error) return fallback;
  if (typeof error === 'string') return sanitizeErrorMessage(error, fallback);

  // Handle standard Error object
  if (error instanceof Error && error.message) {
    return sanitizeErrorMessage(error.message, fallback);
  }

  // Recursively extract message from nested objects with priority order
  const extractFromObject = (obj, visited = new WeakSet()) => {
    if (!obj || typeof obj !== 'object') return null;
    if (visited.has(obj)) return null;
    visited.add(obj);

    // Exact priority order as specified:
    // 1. error.response?.data?.detail
    // 2. error.response?.data?.message
    // 3. error.response?.data?.error?.message
    // 4. error.response?.data?.error
    // 5. error.detail
    // 6. error.message
    // 7. error.error?.message
    // 8. error.error
    // 9. fallback message
    // Plus Razorpay specific: response.error?.description, response.error?.reason, response.error?.code, response.error?.metadata

    const tryPath = (obj, path) => {
      try {
        const parts = path.split('?.');
        let current = obj;
        for (const part of parts) {
          current = current?.[part];
        }
        return current;
      } catch (_) {
        return null;
      }
    };

    // Priority 1: response.data.detail
    let val = tryPath(obj, 'response?.data?.detail');
    if (typeof val === 'string' && val.trim()) return val;

    // Priority 2: response.data.message
    val = tryPath(obj, 'response?.data?.message');
    if (typeof val === 'string' && val.trim()) return val;

    // Priority 3: response.data.error.message
    val = tryPath(obj, 'response?.data?.error?.message');
    if (typeof val === 'string' && val.trim()) return val;

    // Priority 4: response.data.error
    val = tryPath(obj, 'response?.data?.error');
    if (typeof val === 'string' && val.trim()) return val;
    if (val && typeof val === 'object') {
      const nested = extractFromObject(val, visited);
      if (nested) return nested;
    }

    // Priority 5: error.detail
    val = tryPath(obj, 'detail');
    if (typeof val === 'string' && val.trim()) return val;

    // Priority 6: error.message
    val = tryPath(obj, 'message');
    if (typeof val === 'string' && val.trim()) return val;

    // Priority 7: error.error.message
    val = tryPath(obj, 'error?.message');
    if (typeof val === 'string' && val.trim()) return val;

    // Priority 8: error.error
    val = tryPath(obj, 'error');
    if (typeof val === 'string' && val.trim()) return val;
    if (val && typeof val === 'object') {
      const nested = extractFromObject(val, visited);
      if (nested) return nested;
    }

    // Razorpay specific: response.error.description, reason, code, metadata
    const rzpError = tryPath(obj, 'response?.error') || tryPath(obj, 'error');
    if (rzpError && typeof rzpError === 'object') {
      const rzpKeys = ['description', 'reason', 'code', 'metadata'];
      for (const key of rzpKeys) {
        const rzpVal = rzpError[key];
        if (typeof rzpVal === 'string' && rzpVal.trim()) return rzpVal;
        if (rzpVal && typeof rzpVal === 'object') {
          const nested = extractFromObject(rzpVal, visited);
          if (nested) return nested;
        }
      }
    }

    // Generic recursive extraction for any remaining objects
    const genericKeys = [
      'description',
      'reason',
      'errorMessage',
      'statusText',
      'status',
      'name',
    ];

    for (const key of genericKeys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
      if (value && typeof value === 'object') {
        const nested = extractFromObject(value, visited);
        if (nested) return nested;
      }
    }

    return null;
  };

  const extracted = extractFromObject(error);
  if (extracted) return sanitizeErrorMessage(extracted, fallback);

  // Handle arrays of errors (e.g., validation errors)
  if (Array.isArray(error)) {
    const messages = error
      .map(e => getErrorMessage(e, ''))
      .filter(m => m)
      .join(', ');
    if (messages) return messages;
  }

  return fallback;
};

/**
 * Normalizes error for UI display
 */
export const normalizeError = (error, fallback = 'Something went wrong. Please try again.') => {
  const message = getErrorMessage(error, fallback);
  if (message === '[object Object]') return fallback;
  return message || fallback;
};
