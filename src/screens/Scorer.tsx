import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { pointLabels, scoreBanner, serveSlot } from '../core/scoring';
import { currentServer } from '../core/serve';
import { canConfirm, canScore, isHostRole, liveMatchOnCourt, nameOf, pendingResult, sideName, type MatchState } from '../core/session';
import { EnterScoreSheet, SkipSheet } from '../ui/session-ui';
import type { Team } from '../core/types';
import { useT } from '../i18n';
import { backend } from '../state';
import { errorCode, type SessionCtx } from '../state/useSession';
import { Btn, Icon, Sheet, useToast } from '../ui/kit';

/** Scoring screen for one court. Used by the host (/s/:id/court/:n) and players (/p/:slug/court/:n). */
export function Scorer({ ctx, court, back, backLabel = 'back_courts' }: { ctx: SessionCtx; court: number; back: string; backLabel?: 'back_courts' | 'back_status' }) {
  const { state: s, device, locks, append, sessionId } = ctx;
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const m = liveMatchOnCourt(s, court);
  const lock = locks.find((l) => l.court === court);
  const holder = lock && m && lock.matchId === m.id ? lock.deviceId : null;
  const mine = !!device && holder === device;
  const allowed = canScore(s, device, m);
  const [taking, setTaking] = useState(false);
  const [pickServer, setPickServer] = useState(false);
  const [serveSkipped, setServeSkipped] = useState(false);
  const [skipAsk, setSkipAsk] = useState(false);
  const [entering, setEntering] = useState(false);
  const hadLock = useRef(false);

  // Take the court when nobody holds it; keep it alive with a heartbeat.
  useEffect(() => {
    if (!sessionId || !m || !allowed) return;
    if (!holder) void backend.acquireLock(sessionId, court, m.id, false).catch(() => undefined);
  }, [sessionId, m?.id, allowed, holder, court]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionId || !mine) return;
    hadLock.current = true;
    const timer = setInterval(() => void backend.heartbeat(sessionId, court), 15_000);
    return () => clearInterval(timer);
  }, [sessionId, mine, court]);

  useEffect(() => {
    if (hadLock.current && !mine && holder) {
      toast(t('lost_lock'));
      hadLock.current = false;
    }
  }, [mine, holder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionId) return;
    return () => {
      if (hadLock.current) void backend.releaseLock(sessionId, court);
    };
  }, [sessionId, court]);

  const send = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast(t('error', { code: errorCode(e) }));
    }
  };

  const point = (team: Team) => m && mine && m.status === 'live' && send(() => append({ type: 'point', payload: { matchId: m.id, court, team } }));
  const undo = () => m && mine && send(() => append({ type: 'undo', payload: { matchId: m.id, court } }));

  // Keyboard scoring on laptops and iPads: arrows score, Z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') void point(0);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') void point(1);
      else if (e.key.toLowerCase() === 'z') void undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Closed session: go back to the page that shows the summary.
  if (s.status === 'closed') return <Navigate to={back} replace />;

  if (!m) {
    return (
      <>
        <p className="box muted">{t('no_match')}</p>
        <Link className="btn ghost" to={back}>
          <Icon name="left" />
          <span>{t(backLabel)}</span>
        </Link>
      </>
    );
  }

  const slot = serveSlot(m.score);
  const server = currentServer(m.serve, slot);
  const needServer = mine && m.status === 'live' && !m.serve && m.inputs.length === 0 && !serveSkipped;
  // A typed-in result shows its games on the board while it waits for the confirm.
  const shownGames = (team: 0 | 1) => (m.entered ? (team === 0 ? m.entered.gamesA : m.entered.gamesB) : m.score.games[team]);
  const labels = pointLabels(m.score);
  const banner = scoreBanner(m.score, s.settings.rules);
  const holderName = s.players.find((p) => p.deviceId === holder)?.name ?? t('someone');
  const stale = lock ? Date.now() - lock.heartbeatAt > 60_000 : false;
  const lastPoint = [...m.inputs].reduce<Team[]>((acc, i) => (i.type === 'undo' ? acc.slice(0, -1) : [...acc, i.team]), []).at(-1);
  const confirmable = canConfirm(s, device, m, holder);
  const pending = pendingResult(m);

  const saveEntered = (gamesA: number, gamesB: number) =>
    send(async () => {
      setEntering(false);
      await append({ type: 'record_result', payload: { matchId: m.id, court, gamesA, gamesB } });
      toast(t('saved_result'));
      // A host's entry finishes the match; a player's waits here for the other team.
      if (isHostRole(ctx.role)) nav(back);
    });

  const setServer = (playerId: string) =>
    send(async () => {
      setPickServer(false);
      await append({ type: 'set_server', payload: { matchId: m.id, court, playerId } });
    });

  const confirm = () =>
    send(async () => {
      await append({ type: 'confirm', payload: { matchId: m.id, court } });
      nav(back);
    });

  const takeOver = () =>
    send(async () => {
      setTaking(false);
      await backend.acquireLock(sessionId!, court, m.id, true);
    });

  const sides: [Team, string[]][] = [
    [0, m.a],
    [1, m.b],
  ];

  return (
    <div className="scorer">
      <div className="scorer-head">
        <b>{t('court_n', { n: court })}</b>
        <span className="small muted">{t('first_to_n', { n: s.settings.rules.gamesTo })} · {t(s.settings.rules.deuce)}</span>
      </div>

      {server && (
        <div className="serving">
          <span>
            <span className="ball" aria-hidden="true" /> {t('serving', { name: nameOf(s, server) })}
          </span>
          {mine && (
            <button className="link-btn" onClick={() => setPickServer(true)}>
              {t('change')}
            </button>
          )}
        </div>
      )}

      {(needServer || pickServer) && (
        <ServerPicker
          m={m}
          title={pickServer ? t('who_now') : t('who_serves')}
          help={pickServer ? t('who_now_help') : t('who_serves_help')}
          nameOf={(id) => nameOf(s, id)}
          onPick={setServer}
          onToss={pickServer ? undefined : () => setServer([...m.a, ...m.b][Math.floor(Math.random() * (m.a.length + m.b.length))]!)}
          onCancel={pickServer ? () => setPickServer(false) : () => setServeSkipped(true)}
          cancelLabel={pickServer ? t('cancel') : t('skip_for_now')}
        />
      )}

      {banner && m.status === 'live' && (
        <div className="banner">{banner === 'tiebreak' ? t('banner_tiebreak', { n: s.settings.rules.tiebreakTo }) : t(`banner_${banner}`)}</div>
      )}

      {m.status === 'pending' && pending && (
        <div className="card accent gsm">
          <b>{t('gsm_title')}</b>
          <p className="small">
            {t('gsm_body', {
              team: sideName(s, pending.winner === 0 ? m.a : m.b),
              score: `${Math.max(pending.gamesA, pending.gamesB)}-${Math.min(pending.gamesA, pending.gamesB)}`,
            })}
          </p>
          <div className="actions">
            {mine && (
              <Btn icon="undo" onClick={undo}>
                {t(m.entered ? 'take_back' : 'undo_last_point')}
              </Btn>
            )}
            {confirmable && (
              <Btn kind="dark" icon="check" onClick={confirm}>
                {t('confirm_result')}
              </Btn>
            )}
          </div>
          {!confirmable && (
            <p className="small">
              {t('wait_confirm')} {t('ask_host_confirm')}
            </p>
          )}
        </div>
      )}

      {!mine && (
        <p className="view-only">
          <Icon name="lock" size={14} /> {t('view_only_label')}
        </p>
      )}
      {/* Inactive boards keep full contrast; only the tap hints disappear. */}
      <div className={`board ${!mine || m.status !== 'live' || needServer || pickServer ? 'inactive' : ''}`}>
        {sides.map(([team, side]) => (
          <button
            key={team}
            className={`team ${team === 1 ? 'alt' : ''} ${m.status === 'pending' && m.score.winner === team ? 'won' : ''}`}
            disabled={!mine || m.status !== 'live' || needServer || pickServer}
            aria-label={t('add_point_for', { team: sideName(s, side) })}
            onClick={() => void point(team)}
          >
            <span className="team-name">
              {sideName(s, side)} {server && side.includes(server) && <span className="ball" aria-hidden="true" />}
            </span>
            {mine && m.status === 'live' && <span className="tap">{t('tap_to_score')}</span>}
            <span className="team-points">
              {m.score.tiebreak ? 'TB' : t('points')}{' '}
              <b key={labels[team]} className="flash">
                {labels[team]}
              </b>
            </span>
            <span className="team-games digits" key={shownGames(team)}>
              {shownGames(team)}
            </span>
          </button>
        ))}
      </div>

      {mine && (
        <button className="undo-bar" onClick={undo} disabled={lastPoint === undefined}>
          <span>
            <Icon name="undo" /> {t('undo')}
          </span>
          <span className="small muted">{lastPoint !== undefined ? sideName(s, lastPoint === 0 ? m.a : m.b) : ''}</span>
        </button>
      )}

      {!mine && (
        <div className="box">
          {holder ? (
            <p>{stale ? t('lock_stale', { name: holderName }) : t('lock_taken', { name: holderName })}</p>
          ) : (
            <p>
              <b>{t('view_only')}.</b> {t(s.settings.scorerMode === 'host' ? 'view_only_host' : 'view_only_players')}
            </p>
          )}
          {allowed && holder && (
            <Btn small icon="edit" onClick={() => setTaking(true)}>
              {t('take_over')}
            </Btn>
          )}
        </div>
      )}

      <div className="actions">
        {m.status === 'live' && (mine || isHostRole(ctx.role)) && (
          <Btn icon="edit" onClick={() => setEntering(true)}>
            {t('enter_final')}
          </Btn>
        )}
        {mine && ctx.role !== 'player' && (
          <Btn icon="skip" onClick={() => setSkipAsk(true)}>
            {t('skip')}
          </Btn>
        )}
        <Link className="btn ghost" to={back}>
          <Icon name="grid" />
          <span>{t(backLabel)}</span>
        </Link>
      </div>

      <EnterScoreSheet s={s} m={m} open={entering} onClose={() => setEntering(false)} onSave={saveEntered} />

      <Sheet open={taking} onClose={() => setTaking(false)} title={t('take_over_title')}>
        <p>{t('take_over_body', { name: holderName })}</p>
        <div className="actions">
          <Btn icon="left" onClick={() => setTaking(false)}>
            {t('cancel')}
          </Btn>
          <Btn kind="primary" icon="check" onClick={takeOver}>
            {t('take_over')}
          </Btn>
        </div>
      </Sheet>

      <SkipSheet
        s={s}
        m={skipAsk ? m : null}
        onClose={() => setSkipAsk(false)}
        onSkip={(x) =>
          send(async () => {
            setSkipAsk(false);
            const id = x.id;
            await append({ type: 'skip_match', payload: { matchId: id } });
            toast(t('skipped_toast'), { label: t('undo'), run: () => void send(() => append({ type: 'unskip_match', payload: { matchId: id } })) });
            nav(back);
          })
        }
        onPostpone={(x) =>
          send(async () => {
            setSkipAsk(false);
            await append({ type: 'postpone_match', payload: { matchId: x.id } });
            toast(t('postponed_toast'));
            nav(back);
          })
        }
      />
    </div>
  );
}

function ServerPicker(props: {
  m: MatchState;
  title: string;
  help: string;
  nameOf: (id: string) => string;
  onPick: (id: string) => void;
  onToss?: () => void;
  onCancel: () => void;
  cancelLabel: string;
}) {
  const t = useT();
  return (
    <div className="card accent picker">
      <b>{props.title}</b>
      <p className="small">{props.help}</p>
      {[props.m.a, props.m.b].map((side, i) => (
        <div key={i} className="picker-row">
          {side.map((id) => (
            <button key={id} className="pick" onClick={() => props.onPick(id)}>
              <span className="radio" aria-hidden="true" /> {props.nameOf(id)}
            </button>
          ))}
        </div>
      ))}
      <div className="picker-foot">
        {props.onToss && (
          <button className="link-btn" onClick={props.onToss}>
            {t('toss')}
          </button>
        )}
        <button className="link-btn" onClick={props.onCancel}>
          {props.cancelLabel}
        </button>
      </div>
    </div>
  );
}
