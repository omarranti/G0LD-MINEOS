/**
 * UTM Parameter Tracking for Beacons Analytics
 * 
 * Preserves UTM parameters for analytics while keeping canonical URLs clean.
 * UTMs are stored in localStorage/cookies for form attribution.
 */

const UTM_STORAGE_KEY = 'therma_utm_params';
const UTM_EXPIRY_DAYS = 30;

interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  fbclid?: string;
  gclid?: string;
  ref?: string;
  source?: string;
}

/**
 * Extract UTM parameters from URL
 */
export function extractUtmParams(url: string | URL): UtmParams {
  const urlObj = typeof url === 'string' ? new URL(url, window.location.origin) : url;
  const params: UtmParams = {};
  
  const utmKeys: (keyof UtmParams)[] = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'fbclid',
    'gclid',
    'ref',
    'source',
  ];
  
  utmKeys.forEach((key) => {
    const value = urlObj.searchParams.get(key);
    if (value) {
      params[key] = value;
    }
  });
  
  return params;
}

/**
 * Store UTM parameters in localStorage
 */
export function storeUtmParams(params: UtmParams): void {
  if (typeof window === 'undefined') return;
  
  if (Object.keys(params).length === 0) return;
  
  const data = {
    params,
    timestamp: Date.now(),
  };
  
  try {
    localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage may be disabled
    console.warn('Failed to store UTM params:', e);
  }
}

/**
 * Get stored UTM parameters
 */
export function getStoredUtmParams(): UtmParams | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(UTM_STORAGE_KEY);
    if (!stored) return null;
    
    const data = JSON.parse(stored);
    const age = Date.now() - data.timestamp;
    const maxAge = UTM_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    // Expire after 30 days
    if (age > maxAge) {
      localStorage.removeItem(UTM_STORAGE_KEY);
      return null;
    }
    
    return data.params;
  } catch (e) {
    return null;
  }
}

/**
 * Initialize UTM tracking on page load
 * Call this in a useEffect on pages that need attribution
 */
export function initUtmTracking(): void {
  if (typeof window === 'undefined') return;
  
  // Extract UTMs from current URL
  const currentParams = extractUtmParams(window.location.href);
  
  // Store if found
  if (Object.keys(currentParams).length > 0) {
    storeUtmParams(currentParams);
  }
  
  // Also check for stored params and merge with current
  const storedParams = getStoredUtmParams();
  if (storedParams) {
    // Merge stored with current (current takes precedence)
    const merged = { ...storedParams, ...currentParams };
    if (Object.keys(merged).length > 0) {
      storeUtmParams(merged);
    }
  }
}

/**
 * Get UTM params for form submission
 * Returns current URL params merged with stored params
 */
export function getUtmParamsForSubmission(): UtmParams {
  const currentParams = extractUtmParams(window.location.href);
  const storedParams = getStoredUtmParams() || {};
  
  // Current params take precedence
  return { ...storedParams, ...currentParams };
}

/**
 * Clean URL by removing UTM parameters
 * Use this for canonical URLs and sharing
 */
export function cleanUrl(url: string | URL): string {
  const urlObj = typeof url === 'string' ? new URL(url, window.location.origin) : url;
  const utmKeys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'fbclid',
    'gclid',
    'ref',
    'source',
  ];
  
  utmKeys.forEach((key) => {
    urlObj.searchParams.delete(key);
  });
  
  return urlObj.toString();
}
