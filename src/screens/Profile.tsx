import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ProfileView } from '../core/profileView';
import type { Record2 } from '../core/stats';
import { useT } from '../i18n';
import { backend } from '../state';
import { errorCode } from '../state/useSession';
import { Avatar } from '../ui/account';
import { Btn, copyText, Icon, Page, useToast } from '../ui/kit';

/** /u/:id: a player's profile, as the server lets this viewer see it. */
export function ProfilePage() {
  const { id = '' } = useParams();
  const t = useT();
  const [view, setView] = useState<ProfileView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setView(undefined);
    setError(null);
    backend.profileView(id).then(setView, (e) => setError(errorCode(e)));
  }, [id]);

  if (error) {
    return (
      <Page header="full">
        <p className="box warn">{t('error_load', { code: error })}</p>
      </Page>
    );
  }
  if (view === undefined) return <Page header="full">{t('loading')}</Page>;
  if (view === null || view.private) {
    return (
      <Page header="full">
        <section className="court-surface hero">
          <h1>{view?.name ?? t('pf_missing')}</h1>
          <p>{view ? t('pf_private') : t('pf_missing_body')}</p>
        </section>
        <Link className="btn ghost" to="/">
          <Icon name="left" />
          <span>{t('back_home')}</span>
        </Link>
      </Page>
    );
  }
  return <ProfileBody v={view} />;
}

function ProfileBody({ v }: { v: ProfileView }) {
  const t = useT();
  const toast = useToast();
  const facts = [
    v.city,
    v.hand ? t(v.hand === 'left' ? 'pf_left' : 'pf_right') : null,
    v.formatPref ? t(`pf_pref_${v.formatPref}`) : null,
  ].filter(Boolean);
  const nameOf = (r: Record2) => v.people[r.user]?.name ?? t('pf_someone');
  const hidden = (shown: boolean) => v.owner && !shown && <span className="tag soft">{t('pf_hidden')}</span>;
  const c = v.career;

  return (
    <Page header="full">
      <section className="court-surface hero profile-hero">
        <div className="profile-id">
          <Avatar name={v.name} url={v.photoUrl} size={64} />
          <div>
            <h1>{v.name}</h1>
            {facts.length > 0 && <p className="small">{facts.join(' · ')}</p>}
          </div>
        </div>
        {v.level !== null && (
          <div className="level-badge">
            <span className="eyebrow">{t(v.owner ? 'start_level' : 'pf_level')}</span>
            <b>{v.level.toFixed(2)}</b>
            {v.ratedMatches < 10 && <span className="small">{t('pf_settling', { n: v.ratedMatches })}</span>}
          </div>
        )}
        {v.owner && (
          <div className="btn-row">
            <Link className="btn primary" to="/settings">
              <Icon name="edit" />
              <span>{t('edit_profile')}</span>
            </Link>
            <Btn
              icon="link"
              onClick={async () => {
                if (await copyText(window.location.href)) toast(t('copied'));
              }}
            >
              {t('pf_share')}
            </Btn>
          </div>
        )}
        {v.owner && !v.isPublic && <p className="small">{t('pf_private_own')}</p>}
      </section>

      {c && (
        <section>
          <h3>
            {t('pf_stats')} {hidden(v.show.stats)}
          </h3>
          {c.matches === 0 ? (
            <p className="box muted">{t('pf_no_matches')}</p>
          ) : (
            <>
              <div className="stats">
                <div>
                  <b>{c.matches}</b>
                  <span>{t('pf_matches')}</span>
                </div>
                <div>
                  <b>
                    {c.wins}-{c.losses}
                  </b>
                  <span>{t('record')}</span>
                </div>
                <div className="hl">
                  <b>{c.winPct}%</b>
                  <span>{t('pf_win_pct')}</span>
                </div>
                <div>
                  <b>{c.streak}</b>
                  <span>{t('pf_streak')}</span>
                </div>
              </div>
              <ul className="list facts">
                <li className="row">
                  <span className="grow">{t('pf_sessions')}</span>
                  <b>{c.sessions}</b>
                </li>
                <li className="row">
                  <span className="grow">{t('pf_games')}</span>
                  <b>
                    {c.gamesWon}-{c.gamesLost}
                  </b>
                </li>
                <li className="row">
                  <span className="grow">{t('singles')}</span>
                  <b>{t('pf_wins_of', { w: c.singles.wins, n: c.singles.matches })}</b>
                </li>
                <li className="row">
                  <span className="grow">{t('doubles')}</span>
                  <b>{t('pf_wins_of', { w: c.doubles.wins, n: c.doubles.matches })}</b>
                </li>
              </ul>
            </>
          )}
        </section>
      )}

      {v.opponents && (
        <section>
          <h3>
            {t('pf_h2h')} {hidden(v.show.h2h)}
          </h3>
          {(v.bestPartner || v.toughestRival) && (
            <div className="duo">
              {v.bestPartner && (
                <div className="card">
                  <span className="eyebrow">{t('pf_best_partner')}</span>
                  <b>{nameOf(v.bestPartner)}</b>
                  <span className="small muted">{t('pf_wl', { w: v.bestPartner.wins, l: v.bestPartner.losses })}</span>
                </div>
              )}
              {v.toughestRival && (
                <div className="card">
                  <span className="eyebrow">{t('pf_rival')}</span>
                  <b>{nameOf(v.toughestRival)}</b>
                  <span className="small muted">{t('pf_wl', { w: v.toughestRival.wins, l: v.toughestRival.losses })}</span>
                </div>
              )}
            </div>
          )}
          {v.opponents.length === 0 && (v.partners?.length ?? 0) === 0 ? (
            <p className="box muted">{t('pf_no_h2h')}</p>
          ) : (
            <>
              <People title={t('pf_against')} rows={v.opponents} v={v} />
              <People title={t('pf_with')} rows={v.partners ?? []} v={v} />
            </>
          )}
        </section>
      )}

      {v.history && (
        <section>
          <h3>
            {t('pf_history')} {hidden(v.show.history)}
          </h3>
          {v.history.length === 0 ? (
            <p className="box muted">{t('pf_no_matches')}</p>
          ) : (
            v.history.map((h) => (
              <div key={h.sessionId} className="history-session">
                <p className="small muted">
                  <b>{h.sessionName}</b> · {new Date(h.playedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <ul className="list">
                  {h.matches.map((m) => (
                    <li key={m.matchId} className="row history-row">
                      <span className={`tag ${m.won ? '' : 'soft'}`}>{m.won ? t('pf_w') : t('pf_l')}</span>
                      <span className="grow">
                        {m.partners.length > 0 && <span className="muted">{t('pf_with_x', { names: m.partners.join(' & ') })} </span>}
                        {t('vs')} <b>{m.opponents.join(' & ')}</b>
                      </span>
                      <span className="digits">
                        {m.myGames}-{m.theirGames}
                      </span>
                      {m.delta !== null && <span className={`delta ${m.delta >= 0 ? 'up' : 'down'}`}>{(m.delta >= 0 ? '+' : '') + (m.delta / 400).toFixed(2)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}
    </Page>
  );
}

function People({ title, rows, v }: { title: string; rows: Record2[]; v: ProfileView }) {
  const t = useT();
  if (!rows.length) return null;
  return (
    <>
      <p className="small muted">{title}</p>
      <ul className="list">
        {rows.map((r) => {
          const p = v.people[r.user];
          return (
            <li key={r.user} className="row">
              <Avatar name={p?.name ?? '?'} url={p?.photoUrl ?? null} size={30} />
              <span className="grow">{p?.open ? <Link to={`/u/${r.user}`}>{p.name}</Link> : (p?.name ?? t('pf_someone'))}</span>
              <b>{t('pf_wl', { w: r.wins, l: r.losses })}</b>
            </li>
          );
        })}
      </ul>
    </>
  );
}
