import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PrefsProvider, useT } from './i18n';
import { Board } from './screens/Board';
import { Home } from './screens/Home';
import { HostLink, HostLive, HostScorer, HostStandings, HostSummary } from './screens/HostPages';
import { Players } from './screens/Players';
import { PublicHome, PublicLive, PublicScorer, PublicTV } from './screens/Public';
import { Roster } from './screens/Roster';
import { Setup } from './screens/Setup';
import { ToastProvider, useToast } from './ui/kit';

/** Tells the user when an offline change was refused by the server after reconnecting. */
function DroppedListener() {
  const toast = useToast();
  const t = useT();
  useEffect(() => {
    const on = (e: Event) => toast(t('dropped', { code: (e as CustomEvent).detail?.code ?? '' }));
    const off = () => toast(t('offline'));
    window.addEventListener('saliiim:dropped', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('saliiim:dropped', on);
      window.removeEventListener('offline', off);
    };
  }, [toast, t]);
  return null;
}

export function App() {
  return (
    <PrefsProvider>
      <ToastProvider>
        <DroppedListener />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/new" element={<Setup />} />
            <Route path="/s/:id" element={<Board />} />
            <Route path="/s/:id/players" element={<Players />} />
            <Route path="/s/:id/roster" element={<Roster />} />
            <Route path="/s/:id/court/:n" element={<HostScorer />} />
            <Route path="/s/:id/standings" element={<HostStandings />} />
            <Route path="/s/:id/live" element={<HostLive />} />
            <Route path="/s/:id/summary" element={<HostSummary />} />
            <Route path="/h/:id" element={<HostLink />} />
            <Route path="/p/:slug" element={<PublicHome />} />
            <Route path="/p/:slug/live" element={<PublicLive />} />
            <Route path="/p/:slug/tv" element={<PublicTV />} />
            <Route path="/p/:slug/court/:n" element={<PublicScorer />} />
            <Route path="/p/:slug/summary" element={<PublicHome />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </PrefsProvider>
  );
}
