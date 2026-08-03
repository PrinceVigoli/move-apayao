/**
 * Privacy-respecting analytics, disabled by default.
 *
 * Uses Plausible — cookieless, collects no personal data, and needs no consent
 * banner. That matters for a government site: Google Analytics would drag in
 * Data Privacy Act consent obligations for a page that has no reason to
 * identify anyone.
 *
 * To enable, set both in artifacts/landing/.env:
 *   VITE_ANALYTICS_DOMAIN=moveapayao.gov.ph
 *   VITE_ANALYTICS_SRC=https://plausible.io/js/script.js
 *
 * With either unset, nothing loads and no requests are made.
 */
export function initAnalytics(): void {
  const domain = import.meta.env.VITE_ANALYTICS_DOMAIN;
  const src = import.meta.env.VITE_ANALYTICS_SRC;
  if (!domain || !src) return;
  if (document.querySelector('script[data-domain]')) return;

  const el = document.createElement('script');
  el.defer = true;
  el.setAttribute('data-domain', domain);
  el.src = src;
  document.head.appendChild(el);
}
