import { useState } from 'react';
import { Link } from 'react-router-dom';
import { liveMatchOnCourt, type LiveChoice, type PlayerState, type SessionState } from '../core/session';
import { useT } from '../i18n';
import { newId } from '../state/backend';
import type { SessionCtx } from '../state/useSession';
import { Btn, Icon, Sheet } from '../ui/kit';
import { useRunner } from './Board';
import { HostGate } from './HostGate';

export function Roster() {
  return <HostGate>{(ctx) => <RosterBody ctx={ctx} />}</HostGate>;
}

function liveScore(s: SessionState, playerId: string): string | null {
  for (let c = 1; c <= s.settings.courts; c++) {
    const m = liveMatchOnCourt(s, c);
    if (m && [...m.a, ...m.b].includes(playerId)) return `${m.score.games[0]}-${m.score.games[1]}`;
  }
  return null;
}

function RosterBody({ ctx }: { ctx: SessionCtx }) {
  const { state: s, append, role, sessionId } = ctx;
  const t = useT();
  const run = useRunner();
  const [leaving, setLeaving] = useState<PlayerState | null>(null);
  const [stepping, setStepping] = useState(false);
  const [late, setLate] = useState('');

  const listed = s.players.filter((p) => p.status === 'active' || p.status === 'left');
  const leaveScore = leaving ? liveScore(s, leaving.id) : null;

  const leave = (p: PlayerState, live: LiveChoice) =>
    run(async () => {
      setLeaving(null);
      await append({ type: 'mark_left', payload: { playerId: p.id, live } });
    });

  const stepOff = (live: LiveChoice) =>
    run(async () => {
      setStepping(false);
      await append({ type: 'step_off', payload: { live } });
    });

  const hostScore = s.hostPlayerId ? liveScore(s, s.hostPlayerId) : null;

  return (
    <>
      <h1>{t('roster_title')}</h1>
      <p className="muted">{t('roster_sub')}</p>
      <ul className="list">
        {listed.map((p) => {
          const isHost = p.id === s.hostPlayerId;
          const cohost = !!p.deviceId && s.cohostDevices.includes(p.deviceId);
          return (
            <li key={p.id} className={`row wrap ${p.status === 'left' ? 'struck' : ''}`}>
              <span className="grow">
                <b>{p.name}</b> {isHost && <span className="tag">{t('host')}</span>}
                {cohost && <span className="tag soft">{t('cohost')}</span>}
                {p.status === 'left' && <span className="tag soft">{t('left')}</span>}
              </span>
              {p.status === 'active' && (
                <span className="row-actions">
                  {role === 'host' && p.deviceId && !isHost && !cohost && (
                    <Btn small icon="star" onClick={() => run(() => append({ type: 'promote', payload: { playerId: p.id } }))}>
                      {t('make_cohost')}
                    </Btn>
                  )}
                  {p.deviceId && !isHost && (
                    <Btn small icon="undo" onClick={() => run(() => append({ type: 'reset_claim', payload: { playerId: p.id } }))}>
                      {t('reset_claim')}
                    </Btn>
                  )}
                  {isHost ? (
                    <Btn small kind="danger" icon="out" onClick={() => setStepping(true)}>
                      {t('step_off')}
                    </Btn>
                  ) : (
                    <Btn small kind="danger" icon="out" onClick={() => (liveScore(s, p.id) ? setLeaving(p) : void leave(p, 'skip'))}>
                      {t('mark_left')}
                    </Btn>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const name = late.trim();
          if (!name) return;
          setLate('');
          void run(() => append({ type: 'add_late', payload: { id: newId(), name } }));
        }}
      >
        <input value={late} maxLength={40} placeholder={t('add_late')} aria-label={t('add_late')} onChange={(e) => setLate(e.target.value)} />
        <Btn kind="dark" icon="plus" type="submit">
          {t('add')}
        </Btn>
      </form>

      <Link className="btn ghost" to={`/s/${sessionId}`}>
        <Icon name="left" />
        <span>{t('back_courts')}</span>
      </Link>

      <Sheet open={!!leaving} onClose={() => setLeaving(null)} title={leaving ? t('leave_title', { name: leaving.name }) : ''}>
        <p>{t('leave_live', { score: leaveScore ?? '' })}</p>
        <div className="actions column">
          <Btn icon="check" onClick={() => leaving && leave(leaving, 'keep')} disabled={!leaveScore || leaveScore.split('-')[0] === leaveScore.split('-')[1]}>
            {t('keep_score')}
          </Btn>
          <Btn icon="trophy" onClick={() => leaving && leave(leaving, 'award')}>
            {t('award')}
          </Btn>
          <Btn kind="danger" icon="skip" onClick={() => leaving && leave(leaving, 'skip')}>
            {t('skip_match')}
          </Btn>
          <Btn icon="left" onClick={() => setLeaving(null)}>
            {t('cancel')}
          </Btn>
        </div>
      </Sheet>

      <Sheet open={stepping} onClose={() => setStepping(false)} title={t('step_title')}>
        <ul className="bullets">
          <li>{t('step_1')}</li>
          {s.settings.scorerMode === 'host' && <li>{t('step_2')}</li>}
          <li>{t('step_3')}</li>
        </ul>
        {hostScore && <p className="small">{t('leave_live', { score: hostScore })}</p>}
        <div className="actions column">
          {hostScore ? (
            <>
              <Btn icon="trophy" onClick={() => stepOff('award')}>
                {t('award')}
              </Btn>
              <Btn kind="danger" icon="skip" onClick={() => stepOff('skip')}>
                {t('skip_match')}
              </Btn>
            </>
          ) : (
            <Btn kind="primary" icon="check" onClick={() => stepOff('skip')}>
              {t('step_ok')}
            </Btn>
          )}
          <Btn icon="left" onClick={() => setStepping(false)}>
            {t('cancel')}
          </Btn>
        </div>
      </Sheet>
    </>
  );
}
