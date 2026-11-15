import { useEffect } from 'react';
import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { PrefsProvider, useT } from './i18n';
import { Board } from './screens/Board';
import { Home } from './screens/Home';
import { HostLink, HostLive, HostScorer, HostStandings, HostSummary } from './screens/HostPages';
import { Players } from './screens/Players';
import { PublicHome, PublicLive, PublicScorer, PublicTV } from './screens/Public';
import { Roster } from './screens/Roster';
import { Setup } from './screens/Setup';
import { Icon, Page, ToastProvider, useToast } from './ui/kit';

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

/** Unknown address: say so instead of silently showing Home. */
function NotFound() {
  const t = useT();
  return (
    <Page header="full">
      <h1>{t('nf_title')}</h1>
      <p className="muted">{t('nf_body')}</p>
      <Link className="btn primary" to="/">
        <Icon name="left" />
        <span>{t('back_home')}</span>
      </Link>
    </Page>
  );
}

function Shell() {
  return (
    <>
      <DroppedListener />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/new', element: <Setup /> },
      { path: '/s/:id', element: <Board /> },
      { path: '/s/:id/players', element: <Players /> },
      { path: '/s/:id/roster', element: <Roster /> },
      { path: '/s/:id/court/:n', element: <HostScorer /> },
      { path: '/s/:id/standings', element: <HostStandings /> },
      { path: '/s/:id/live', element: <HostLive /> },
      { path: '/s/:id/summary', element: <HostSummary /> },
      { path: '/h/:id', element: <HostLink /> },
      { path: '/p/:slug', element: <PublicHome /> },
      { path: '/p/:slug/live', element: <PublicLive /> },
      { path: '/p/:slug/tv', element: <PublicTV /> },
      { path: '/p/:slug/court/:n', element: <PublicScorer /> },
      { path: '/p/:slug/summary', element: <PublicHome /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <PrefsProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </PrefsProvider>
  );
}
