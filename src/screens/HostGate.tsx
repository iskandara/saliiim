import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isHostRole } from '../core/session';
import { useT } from '../i18n';
import { remember } from '../state';
import { useSession, type SessionCtx } from '../state/useSession';
import { Btn, Icon, Page, Tabs } from '../ui/kit';

/** Loads the session for host pages and shows a clear message to phones without host rights. */
export function HostGate({ children, tabs = true, wide = false }: { children: (ctx: SessionCtx) => ReactNode; tabs?: boolean; wide?: boolean }) {
  const { id = '' } = useParams();
  const ctx = useSession(id);
  const t = useT();
  const hosting = ctx.ready && isHostRole(ctx.role) && ctx.state.status !== 'empty';
  useEffect(() => {
    if (hosting) remember({ id, slug: ctx.state.slug, name: ctx.state.settings.name, role: 'host', at: ctx.state.createdAt ?? new Date().toISOString() });
  }, [hosting, id, ctx.state.slug, ctx.state.settings.name, ctx.state.createdAt]);
  if (!ctx.ready) return <Page>{t('loading')}</Page>;
  if (ctx.state.status === 'empty') {
    if (ctx.error && ctx.error !== 'not_found') return <LoadError code={ctx.error} />;
    return (
      <Page>
        <p className="box">{t('not_found')}</p>
        <Link className="btn ghost" to="/">
          <Icon name="left" />
          <span>{t('back_home')}</span>
        </Link>
      </Page>
    );
  }
  if (!isHostRole(ctx.role)) {
    return (
      <Page>
        <h1>{t('not_host_title')}</h1>
        <p>{t('not_host_body')}</p>
        <Link className="btn primary" to={`/p/${ctx.state.slug}`}>
          <Icon name="radio" />
          <span>{t('open_public')}</span>
        </Link>
      </Page>
    );
  }
  return (
    <Page wide={wide} tabs={tabs && ctx.state.status !== 'draft' ? <HostTabs id={id} /> : undefined}>
      {ctx.error === 'offline' && <p className="notice">{t('error_offline')}</p>}
      {children(ctx)}
    </Page>
  );
}

/** First load failed for a reason other than "no such session": say so, and offer a retry. */
export function LoadError({ code }: { code: string }) {
  const t = useT();
  return (
    <Page>
      <div className="box warn" role="alert">
        <p>{code === 'offline' ? t('error_offline') : t('error_load')}</p>
        {code !== 'offline' && <p className="small muted">{t('captcha_code', { code })}</p>}
        <Btn icon="undo" onClick={() => window.location.reload()}>
          {t('retry')}
        </Btn>
      </div>
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
