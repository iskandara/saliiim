import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isHostRole } from '../core/session';
import { useT } from '../i18n';
import { remember } from '../state';
import { useSession, type SessionCtx } from '../state/useSession';
import { Page, Tabs } from '../ui/kit';

/** Loads the session for host pages and shows a clear message to phones without host rights. */
export function HostGate({ children, tabs = true }: { children: (ctx: SessionCtx) => ReactNode; tabs?: boolean }) {
  const { id = '' } = useParams();
  const ctx = useSession(id);
  const t = useT();
  const hosting = ctx.ready && isHostRole(ctx.role) && ctx.state.status !== 'empty';
  useEffect(() => {
    if (hosting) remember({ id, slug: ctx.state.slug, name: ctx.state.settings.name, role: 'host', at: ctx.state.createdAt ?? new Date().toISOString() });
  }, [hosting, id, ctx.state.slug, ctx.state.settings.name, ctx.state.createdAt]);
  if (!ctx.ready) return <Page>{t('loading')}</Page>;
  if (ctx.error === 'not_found' || ctx.state.status === 'empty') {
    return (
      <Page>
        <p className="box">{t('not_found')}</p>
        <Link to="/">{t('back_home')}</Link>
      </Page>
    );
  }
  if (!isHostRole(ctx.role)) {
    return (
      <Page>
        <p className="box">{t('host_only_help')}</p>
        <Link to={`/p/${ctx.state.slug}`}>{t('tab_live')}</Link>
      </Page>
    );
  }
  return (
    <Page tabs={tabs && ctx.state.status !== 'draft' ? <HostTabs id={id} /> : undefined}>
      {children(ctx)}
    </Page>
  );
}

export function HostTabs({ id }: { id: string }) {
  const t = useT();
  const path = window.location.pathname;
  return (
    <Tabs
      items={[
        { to: `/s/${id}`, label: t('tab_courts'), icon: 'grid', active: path === `/s/${id}` },
        { to: `/s/${id}/standings`, label: t('tab_standings'), icon: 'trophy', active: path.endsWith('/standings') },
        { to: `/s/${id}/live`, label: t('tab_live'), icon: 'radio', active: path.endsWith('/live') },
      ]}
    />
  );
}
