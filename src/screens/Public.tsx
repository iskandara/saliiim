import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  canConfirm, canScore, liveMatchOnCourt, partnerOf, playerStatus, sideName, unitForPlayer,
  type MatchState, type SessionState,
} from '../core/session';
import { useT } from '../i18n';
import { backend, remember } from '../state';
import { newId } from '../state/backend';
import { errorCode, useSession, type SessionCtx } from '../state/useSession';
import { Btn, Field, Icon, Page, useToast, type HeaderSize } from '../ui/kit';
import { LoadError } from './HostGate';
import { CourtsList, LiveBadge, MiniScore, Notices, StandingsTable } from '../ui/session-ui';
import { LiveView } from './LiveView';
import { Scorer } from './Scorer';
import { SummaryView } from './Summary';

function usePublic(slug: string) {
  const [id, setId] = useState<string | null>(() => sessionStorage.getItem(`saliiim:slug:${slug}`));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    backend
      .openPublic(slug)
      .then((sid) => {
        sessionStorage.setItem(`saliiim:slug:${slug}`, sid);
        setId(sid);
      })
      .catch((e) => setErr(errorCode(e)));
  }, [slug]);
  return { ctx: useSession(id), err };
}

function PublicGate({ children, wide, header }: { children: (ctx: SessionCtx, slug: string) => ReactNode; wide?: boolean; header?: (ctx: SessionCtx) => HeaderSize }) {
  const { slug = '' } = useParams();
  const { ctx, err } = usePublic(slug);
  const t = useT();
  if (err === 'anonymous_auth_disabled') return <Page><p className="box warn">{t('anonymous_auth_disabled')}</p></Page>;
  if (err === 'not_found' || (ctx.ready && ctx.state.status === 'empty' && (!ctx.error || ctx.error === 'not_found'))) {
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
  if (err) return <LoadError code={err} />;
  if (ctx.ready && ctx.state.status === 'empty' && ctx.error) return <LoadError code={ctx.error} />;
  if (!ctx.ready || ctx.state.status === 'empty') return <Page>{t('loading')}</Page>;
  return (
    <Page wide={wide} header={header?.(ctx) ?? 'compact'}>
      {ctx.error === 'offline' && <p className="notice">{t('error_offline')}</p>}
      {children(ctx, slug)}
    </Page>
  );
}

export function PublicHome() {
  // The full masthead greets people arriving from the link; players and the summary get the compact one.
  return (
    <PublicGate header={(ctx) => (ctx.me || ctx.state.status === 'closed' ? 'compact' : 'full')}>
      {(ctx, slug) => <PublicHomeBody ctx={ctx} slug={slug} />}
    </PublicGate>
  );
}

export function PublicLive() {
  return <PublicGate wide>{(ctx, slug) => <LiveView s={ctx.state} slug={slug} ownCard={ctx.role === 'spectator'} />}</PublicGate>;
}

export function PublicTV() {
  return (
    <PublicGate wide header={() => 'none'}>
      {(ctx, slug) => <LiveView s={ctx.state} slug={slug} tv />}
    </PublicGate>
  );
}

export function PublicScorer() {
  const { n = '1' } = useParams();
  return <PublicGate>{(ctx, slug) => <Scorer ctx={ctx} court={Number(n)} back={`/p/${slug}`} backLabel="back_status" />}</PublicGate>;
}

function PublicHomeBody({ ctx, slug }: { ctx: SessionCtx; slug: string }) {
  const { state: s, me } = ctx;
  const watchKey = `saliiim:watch:${slug}`;
  const [watching, setWatching] = useState(() => sessionStorage.getItem(watchKey) === '1');

  useEffect(() => {
    if (me && ctx.sessionId) remember({ id: ctx.sessionId, slug, name: s.settings.name, role: 'player', at: s.createdAt ?? new Date().toISOString() });
  }, [me?.id, ctx.sessionId, slug, s.settings.name, s.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.status === 'closed') return <SummaryView s={s} device={ctx.device} />;
  if (me) return <MeView ctx={ctx} slug={slug} />;
  if (watching) return <LiveView s={s} slug={slug} ownCard />;
  return (
    <JoinView
      ctx={ctx}
      onWatch={() => {
        sessionStorage.setItem(watchKey, '1');
        setWatching(true);
      }}
    />
  );
}

function formatLine(s: SessionState, t: ReturnType<typeof useT>) {
  const parts = [t(s.settings.format)];
  if (s.settings.format === 'doubles') parts.push(t(s.settings.partnerMode));
  parts.push(t('first_to_n', { n: s.settings.rules.gamesTo }), `${s.settings.courts} ${t('courts').toLowerCase()}`);
  return parts.join(' · ');
}

function JoinView({ ctx, onWatch }: { ctx: SessionCtx; onWatch: () => void }) {
  const { state: s, sessionId } = ctx;
  const t = useT();
  const toast = useToast();
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const hostName = s.players.find((p) => p.id === s.hostPlayerId)?.name ?? s.settings.hostName;
  const listed = s.players.filter((p) => p.status === 'active' || p.status === 'pending');
  const hostPlaying = s.players.some((p) => p.id === s.hostPlayerId && p.status === 'active');

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(t('error', { code: errorCode(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="muted small">{t('invited', { host: hostName })}</p>
      <h1>{s.settings.name}</h1>
      <p className="muted small">{formatLine(s, t)}</p>
      {!joining ? (
        <div className="actions column">
          <Btn kind="primary" icon="users" onClick={() => setJoining(true)}>
            {t('join_play')}
          </Btn>
          <Btn icon="radio" onClick={onWatch}>
            {t('just_watch')}
          </Btn>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            void act(() => backend.join(sessionId!, newId(), n));
          }}
        >
          <Field label={t('your_name')}>
            <input value={name} maxLength={40} autoFocus placeholder={t('your_name_ph')} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Btn kind="primary" icon="check" type="submit" disabled={busy || !name.trim()}>
            {t('im_in')}
          </Btn>
        </form>
      )}
      <section>
        <h3>{t('n_in', { n: listed.length })}</h3>
        <ul className="list">
          {!hostPlaying && (
            <li className="row">
              <span className="grow">{hostName}</span>
              <span className="tag soft">{t('host_not_playing')}</span>
            </li>
          )}
          {listed.map((p) => (
            <li key={p.id} className="row">
              <span className="grow">
                {p.name} {p.id === s.hostPlayerId && <span className="tag">{t('host')}</span>}
              </span>
              {p.id !== s.hostPlayerId &&
                (p.deviceId ? (
                  <span className="small muted">{t('taken')}</span>
                ) : (
                  <button className="link-btn" disabled={busy} onClick={() => act(() => backend.claim(sessionId!, p.id))}>
                    {t('thats_me')}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function MeView({ ctx, slug }: { ctx: SessionCtx; slug: string }) {
  const { state: s, me, device, locks, append } = ctx;
  const t = useT();
  const toast = useToast();
  if (!me) return null;
  const status = playerStatus(s, me.id);
  const hostName = s.players.find((p) => p.id === s.hostPlayerId)?.name ?? s.settings.hostName;
  const opp = (m: MatchState) => sideName(s, m.a.includes(me.id) ? m.b : m.a);

  const confirm = async (m: MatchState) => {
    try {
      await append({ type: 'confirm', payload: { matchId: m.id, court: m.court! } });
    } catch (e) {
      toast(t('error', { code: errorCode(e) }));
    }
  };

  let card: ReactNode;
  switch (status.kind) {
    case 'waiting_start': {
      const partner = partnerOf(s, me.id);
      card = (
        <div className="card accent">
          <b>{t('youre_in', { name: me.name })}</b>
          {s.settings.format === 'doubles' && s.settings.partnerMode === 'fixed' && (
            <p className="small">{partner ? `${t('your_partner')} ${sideName(s, [partner])}` : t('partner_tbd')}</p>
          )}
          <p className="small">{t('waiting_start', { host: hostName })}</p>
        </div>
      );
      break;
    }
    case 'pending':
      card = <div className="card">{t('waiting_approval')}</div>;
      break;
    case 'playing': {
      const m = status.match;
      const holder = locks.find((l) => l.court === m.court && l.matchId === m.id)?.deviceId ?? null;
      card = (
        <div className="card accent">
          <b>{t('st_playing')}</b>
          <p className="small">{t('st_playing_sub', { court: m.court!, opp: opp(m) })}</p>
          <MiniScore s={s} m={m} />
          {m.status === 'pending' && canConfirm(s, device, m, holder) && (
            <div className="gsm">
              <b>{t('confirm_yours')}</b>
              <p className="small">
                {t('gsm_body', { team: sideName(s, m.score.winner === 0 ? m.a : m.b), score: `${Math.max(...m.score.games)}-${Math.min(...m.score.games)}` })}
              </p>
              <Btn kind="dark" icon="check" onClick={() => confirm(m)}>
                {t('confirm_result')}
              </Btn>
            </div>
          )}
          {canScore(s, device, liveMatchOnCourt(s, m.court!)) && (!holder || holder === device) && (
            <Link className="btn dark" to={`/p/${slug}/court/${m.court}`}>
              <Icon name="edit" />
              <span>{t('score_my_court')}</span>
            </Link>
          )}
        </div>
      );
      break;
    }
    case 'next':
      card = (
        <div className="card accent">
          <b>{t('st_next')}</b>
          <p className="small">{t('st_next_sub', { opp: opp(status.match) })}</p>
        </div>
      );
      break;
    case 'resting':
      card = (
        <div className="card">
          <b>{t('st_resting')}</b>
          <p className="small">{t('st_resting_sub', { n: status.wait })}</p>
        </div>
      );
      break;
    case 'done':
      card = <div className="card">{t('st_done')}</div>;
      break;
    case 'left':
      card = <div className="card">{t('st_left')}</div>;
      break;
  }

  return (
    <>
      <div className="head">
        <h2>{s.settings.name}</h2>
        {s.status === 'live' && <LiveBadge />}
      </div>
      {card}
      <p className="small muted">{t('wrong_name')}</p>
      <Notices s={s} />
      {s.status === 'live' && (
        <>
          <CourtsList s={s} />
          <StandingsTable s={s} highlight={unitForPlayer(s, me.id)} title={t('standings')} />
          <div className="stack">
            <Link className="btn ghost" to={`/p/${slug}/live`}>
              <Icon name="radio" />
              <span>{t('tab_live')}</span>
            </Link>
          </div>
        </>
      )}
    </>
  );
}
