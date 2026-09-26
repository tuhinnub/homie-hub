import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Protect all /api/* fetch calls against upstream proxy 302 redirects (which convert POST/PUT/DELETE
// into GET when the 60s proxy token cache expires) and keep the proxy session warm.
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const originalFetch = window.fetch.bind(window);

  // Periodically ping /api/health every 25s so the 60s upstream proxy token cache stays warm
  setInterval(() => {
    originalFetch('/api/health', { cache: 'no-store', credentials: 'same-origin' }).catch(() => {});
  }, 25000);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isApiCall = url.startsWith('/api/') || url.includes('/api/');
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (!isApiCall) {
      return originalFetch(input, init);
    }

    const finalInit: RequestInit = {
      ...init,
      credentials: init?.credentials || 'same-origin',
      cache: 'no-store'
    };

    let response = await originalFetch(input, finalInit);

    // If an upstream 302 auth-bridge redirect converted a POST/PUT/PATCH/DELETE into a GET
    // (causing a 409/404 or redirected response) or returned an HTML auth-check page,
    // the redirect has now warmed the proxy cache—immediately retry the original request.
    const contentType = response.headers.get('content-type') || '';
    const isHtmlResponse = !contentType.includes('application/json');
    const shouldRetry =
      response.redirected ||
      response.status === 409 ||
      response.headers.get('x-retry-method') === 'true' ||
      (method !== 'GET' && response.status === 404) ||
      (isHtmlResponse && response.status !== 502 && response.status !== 503 && response.status !== 504);

    if (shouldRetry) {
      await originalFetch('/api/health', { cache: 'no-store', credentials: 'same-origin' }).catch(() => {});
      response = await originalFetch(input, finalInit);
    }

    return response;
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
