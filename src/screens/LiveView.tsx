import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { SessionState } from '../core/session';
import { useT } from '../i18n';
import { Btn, Icon, Seg, Sheet } from '../ui/kit';
import { CourtsList, LiveBadge, NextUp, Notices, ProgressLine, StandingsTable } from '../ui/session-ui';

/** What spectators see: courts and standings. Side by side on wide screens, a switch on phones. */
export function LiveView({ s, slug, ownCard = false, tv = false, exitTo }: {
  s: SessionState;
  slug: string;
  ownCard?: boolean;
  tv?: boolean;
  /** Where "Exit TV mode" goes; defaults to the public live view. */
  exitTo?: string;
}) {
  const t = useT();
  const { pathname } = useLocation();
  const [tab, setTab] = useState<'courts' | 'standings'>('courts');
  const [leaving, setLeaving] = useState(false);
  return (
    <div className={`liveview ${tv ? 'tv' : ''}`}>
      <div className="head">
        <h2>{s.settings.name}</h2>
        {s.status === 'live' && <LiveBadge />}
      </div>
      {!tv && <p className="muted small">{t('spectator_note')}</p>}
      <ProgressLine s={s} />
      <Notices s={s} />
      {!tv && (
        <div className="only-phone">
          <Seg label={t('tab_live')} value={tab} options={[['courts', t('tab_courts')], ['standings', t('tab_standings')]]} onChange={setTab} />
        </div>
      )}
      <div className="split">
        <div className={tab === 'courts' || tv ? '' : 'hide-phone'}>
          <CourtsList s={s} />
          <NextUp s={s} />
        </div>
        <div className={tab === 'standings' || tv ? '' : 'hide-phone'}>
          <StandingsTable s={s} title={t('standings')} />
        </div>
      </div>
      {tv && (
        <Link className="tv-exit" to={exitTo ?? `/p/${slug}/live`}>
          {t('exit_tv')}
        </Link>
      )}
      {!tv && (
        // Remember where TV mode was opened from, so Exit comes back to the same page and its menu.
        <Link className="btn ghost" to={`/p/${slug}/tv`} state={{ back: pathname }}>
          <Icon name="tv" />
          <span>{t('tv_mode')}</span>
        </Link>
      )}
      {ownCard && !tv && (
        <div className="card">
          <b>{t('own_title')}</b>
          <p className="small">{t('own_sub')}</p>
          <Btn kind="primary" icon="plus" onClick={() => setLeaving(true)}>
            {t('own_btn')}
          </Btn>
        </div>
      )}
      <Sheet open={leaving} onClose={() => setLeaving(false)} title={t('leave_view_title')}>
        <p>{t('leave_view_body', { name: s.settings.name })}</p>
        <div className="actions">
          <Btn icon="radio" onClick={() => setLeaving(false)}>
            {t('stay')}
          </Btn>
          <Link className="btn primary" to="/new">
            <Icon name="plus" />
            <span>{t('leave_create')}</span>
          </Link>
        </div>
      </Sheet>
    </div>
  );
}
