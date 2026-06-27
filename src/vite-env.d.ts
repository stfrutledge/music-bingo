/// <reference types="vite/client" />

// Cache-busted asset URL import (e.g. '...svg?url&v=2'). Vite's built-in
// '*?url' declaration only matches specifiers ending in '?url', so the extra
// query param needs its own declaration.
declare module '*?url&v=2' {
  const src: string;
  export default src;
}

declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: Error) => void;
  }

  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
