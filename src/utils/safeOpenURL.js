/**
 * safeOpenURL — scheme-allowlisted wrapper around Linking.openURL.
 *
 * Build 69 Commit I — closes a HIGH-severity client-side audit finding.
 *
 * Background:
 *   The app previously called `Linking.openURL(url)` on strings sourced
 *   from Supabase tables (`product.affiliateUrl`, user-submitted design
 *   images, AI pipeline output URIs, settings-menu items). None of those
 *   call sites validated the URL scheme before handing it to the OS.
 *
 * What goes wrong without validation:
 *   A row in `products` or `user_designs` whose URL looks like
 *   `mailto:attacker@example.com?subject=...&body=...` will silently
 *   launch Mail.app with an attacker-authored draft. `tel:1-900-...`,
 *   `sms:`, `facetime:`, and third-party deep links (Venmo, banking
 *   apps) can all be triggered the same way. This is an exfiltration
 *   and social-engineering surface — not an RCE, but a real abuse path
 *   once RLS lets any signed-in user write to a linkable row.
 *
 * What we allow:
 *   - https:  every legitimate affiliate URL and in-app link.
 *   - mailto: user-initiated support / contact flows ONLY, enforced by
 *             caller: pass allowMailto: true explicitly.
 *   - itms-apps:  App Store deep links (reviews, subscriptions).
 *
 * What we DON'T allow:
 *   - http: (downgraded; force https)
 *   - javascript:, data:, file:, blob:  (XSS / local-file class)
 *   - tel:, sms:, facetime:, any third-party-app scheme (abuse surface)
 *
 * Allowlist is deny-by-default. New schemes require a code review.
 */

import { Linking } from 'react-native';

const ALLOWED_SCHEMES_DEFAULT = new Set(['https:', 'itms-apps:']);
const ALLOWED_SCHEMES_WITH_MAILTO = new Set(['https:', 'itms-apps:', 'mailto:']);

/**
 * Attempt to open a URL. Returns a Promise<boolean> — true if the URL
 * was allowed AND Linking.openURL succeeded, false otherwise. Never
 * throws.
 *
 * @param {string} url
 * @param {{ allowMailto?: boolean, onError?: (err: Error) => void }} [opts]
 * @returns {Promise<boolean>}
 */
export async function safeOpenURL(url, opts = {}) {
  const { allowMailto = false, onError } = opts;
  if (typeof url !== 'string' || url.length === 0) {
    return false;
  }
  const allowed = allowMailto ? ALLOWED_SCHEMES_WITH_MAILTO : ALLOWED_SCHEMES_DEFAULT;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    if (__DEV__) console.warn('[safeOpenURL] invalid URL rejected:', url.substring(0, 80));
    return false;
  }
  if (!allowed.has(parsed.protocol)) {
    if (__DEV__) console.warn('[safeOpenURL] scheme not allowed:', parsed.protocol, url.substring(0, 80));
    return false;
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    if (onError) {
      try { onError(err); } catch { /* caller error is their problem */ }
    } else if (__DEV__) {
      console.warn('[safeOpenURL] Linking.openURL failed:', err?.message || err);
    }
    return false;
  }
}

export default safeOpenURL;
