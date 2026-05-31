/* eslint-disable no-console */

import { register } from 'register-service-worker';

function getServiceWorkerUrl() {
  const baseUrl = process.env.BASE_URL || '/';
  try {
    const resolvedBase = new URL(baseUrl, window.location.origin);
    if (resolvedBase.origin !== window.location.origin) {
      // Service Worker must be registered from the page origin, not the CDN.
      return null;
    }
    return new URL('service-worker.js', resolvedBase).href;
  } catch {
    return `${baseUrl}service-worker.js`;
  }
}

const serviceWorkerUrl = getServiceWorkerUrl();

if (!process.env.IS_ELECTRON && serviceWorkerUrl) {
  register(serviceWorkerUrl, {
    ready() {
      // console.log(
      //   "App is being served from cache by a service worker.\n" +
      //     "For more details, visit https://goo.gl/AFskqB"
      // );
    },
    registered() {
      // console.log("Service worker has been registered.");
    },
    cached() {
      // console.log("Content has been cached for offline use.");
    },
    updatefound() {
      // console.log("New content is downloading.");
    },
    updated() {
      // console.log("New content is available; please refresh.");
    },
    offline() {
      // console.log(
      //   "No internet connection found. App is running in offline mode."
      // );
    },
    error(error) {
      console.error('Error during service worker registration:', error);
    },
  });
}
