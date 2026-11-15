import { useEffect, useState } from 'react';

/** Chrome's install prompt event; it can fire before any screen mounts, so it is caught here. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const DISMISSED = 'saliiim:install-dismissed';

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DISMISSED) === '1';
  } catch {
    /* storage blocked: show the card */
  }
  return {
    /** 'prompt': one-tap install available. 'ios': show the Share > Add to Home Screen hint. */
    mode: standalone || dismissed ? null : deferred ? ('prompt' as const) : ios ? ('ios' as const) : null,
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      tick((n) => n + 1);
      return outcome === 'accepted';
    },
    dismiss: () => {
      try {
        localStorage.setItem(DISMISSED, '1');
      } catch {
        /* ignore */
      }
      tick((n) => n + 1);
    },
  };
}
