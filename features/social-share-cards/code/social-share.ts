/**
 * Social Share Utilities with UTM Tracking
 * 
 * Generates share URLs for various social platforms with proper UTM parameters
 * for tracking engagement and conversions.
 */

export type SocialPlatform = 
  | 'twitter' 
  | 'facebook' 
  | 'linkedin' 
  | 'pinterest' 
  | 'whatsapp' 
  | 'telegram' 
  | 'email'
  | 'threads'
  | 'reddit';

interface ShareOptions {
  url: string;
  title: string;
  description?: string;
  image?: string;
  hashtags?: string[];
  via?: string; // Twitter handle without @
}

interface ShareUrls {
  twitter: string;
  facebook: string;
  linkedin: string;
  pinterest: string;
  whatsapp: string;
  telegram: string;
  email: string;
  threads: string;
  reddit: string;
}

/**
 * Add UTM parameters to a URL for tracking
 */
export function addUtmParams(
  url: string,
  platform: SocialPlatform,
  campaign?: string
): string {
  const urlObj = new URL(url);
  
  urlObj.searchParams.set('utm_source', platform);
  urlObj.searchParams.set('utm_medium', 'social');
  urlObj.searchParams.set('utm_campaign', campaign || 'share');
  
  return urlObj.toString();
}

/**
 * Generate share URL for Twitter/X
 */
export function getTwitterShareUrl(options: ShareOptions): string {
  const { title, hashtags, via } = options;
  const url = addUtmParams(options.url, 'twitter');
  
  const params = new URLSearchParams({
    url,
    text: title,
  });
  
  if (hashtags?.length) {
    params.set('hashtags', hashtags.join(','));
  }
  
  if (via) {
    params.set('via', via);
  }
  
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/**
 * Generate share URL for Facebook
 */
export function getFacebookShareUrl(options: ShareOptions): string {
  const url = addUtmParams(options.url, 'facebook');
  
  const params = new URLSearchParams({
    u: url,
  });
  
  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
}

/**
 * Generate share URL for LinkedIn
 */
export function getLinkedInShareUrl(options: ShareOptions): string {
  const url = addUtmParams(options.url, 'linkedin');
  
  const params = new URLSearchParams({
    url,
  });
  
  return `https://www.linkedin.com/sharing/share-offsite/?${params.toString()}`;
}

/**
 * Generate share URL for Pinterest
 * Note: Pinterest works best with vertical images (2:3 ratio)
 */
export function getPinterestShareUrl(options: ShareOptions): string {
  const { title, description, image } = options;
  const url = addUtmParams(options.url, 'pinterest');
  
  const params = new URLSearchParams({
    url,
    description: description || title,
  });
  
  if (image) {
    params.set('media', image);
  }
  
  return `https://pinterest.com/pin/create/button/?${params.toString()}`;
}

/**
 * Generate share URL for WhatsApp
 */
export function getWhatsAppShareUrl(options: ShareOptions): string {
  const { title } = options;
  const url = addUtmParams(options.url, 'whatsapp');
  
  const text = `${title}\n\n${url}`;
  
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Generate share URL for Telegram
 */
export function getTelegramShareUrl(options: ShareOptions): string {
  const { title } = options;
  const url = addUtmParams(options.url, 'telegram');
  
  const params = new URLSearchParams({
    url,
    text: title,
  });
  
  return `https://t.me/share/url?${params.toString()}`;
}

/**
 * Generate share URL for Email
 */
export function getEmailShareUrl(options: ShareOptions): string {
  const { title, description } = options;
  const url = addUtmParams(options.url, 'email');
  
  const body = description 
    ? `${description}\n\nRead more: ${url}`
    : `Check this out: ${url}`;
  
  const params = new URLSearchParams({
    subject: title,
    body,
  });
  
  return `mailto:?${params.toString()}`;
}

/**
 * Generate share URL for Threads
 */
export function getThreadsShareUrl(options: ShareOptions): string {
  const { title } = options;
  const url = addUtmParams(options.url, 'threads');
  
  // Threads uses web intent similar to Instagram
  const text = `${title}\n\n${url}`;
  
  return `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`;
}

/**
 * Generate share URL for Reddit
 */
export function getRedditShareUrl(options: ShareOptions): string {
  const { title } = options;
  const url = addUtmParams(options.url, 'reddit');
  
  const params = new URLSearchParams({
    url,
    title,
  });
  
  return `https://www.reddit.com/submit?${params.toString()}`;
}

/**
 * Generate all share URLs at once
 */
export function getAllShareUrls(options: ShareOptions): ShareUrls {
  return {
    twitter: getTwitterShareUrl(options),
    facebook: getFacebookShareUrl(options),
    linkedin: getLinkedInShareUrl(options),
    pinterest: getPinterestShareUrl(options),
    whatsapp: getWhatsAppShareUrl(options),
    telegram: getTelegramShareUrl(options),
    email: getEmailShareUrl(options),
    threads: getThreadsShareUrl(options),
    reddit: getRedditShareUrl(options),
  };
}

/**
 * Copy link to clipboard with UTM tracking
 */
export async function copyShareLink(
  url: string,
  platform: SocialPlatform = 'email'
): Promise<boolean> {
  const trackedUrl = addUtmParams(url, platform, 'copy_link');
  
  try {
    await navigator.clipboard.writeText(trackedUrl);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = trackedUrl;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

/**
 * Open share dialog in a popup window
 */
export function openSharePopup(url: string, platform: SocialPlatform): void {
  const width = 600;
  const height = 400;
  const left = (window.innerWidth - width) / 2;
  const top = (window.innerHeight - height) / 2;
  
  window.open(
    url,
    `share_${platform}`,
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
  );
}

/**
 * Track share event (for analytics)
 */
export function trackShare(platform: SocialPlatform, url: string): void {
  // Google Analytics 4
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', 'share', {
      method: platform,
      content_type: 'article',
      item_id: url,
    });
  }
  
  // Facebook Pixel
  if (typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq('track', 'Share', {
      content_type: 'article',
      content_ids: [url],
    });
  }
}
