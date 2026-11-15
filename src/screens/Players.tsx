import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { estimateMinutes, usableCourts } from '../core/scheduler';
import { activePlayers, previewMatchCount, startProblem, type SessionState } from '../core/session';
import { useT } from '../i18n';
import { saveRoster } from '../state';
import { newId } from '../state/backend';
import { errorCode, type SessionCtx } from '../state/useSession';
import { absUrl, Btn, copyText, Icon, Sheet, useToast } from '../ui/kit';
import { HostGate } from './HostGate';

export function Players() {
  return <HostGate>{(ctx) => <PlayersBody ctx={ctx} />}</HostGate>;
}

function currentPairs(s: SessionState): [string, string][] {
  const active = activePlayers(s).map((p) => p.id);
  const set = new Set(active);
  const valid = s.pairs.length > 0 && s.pairs.every((p) => p.players.every((id) => set.has(id)));
  const pairs: [string, string][] = valid ? s.pairs.map((p) => [p.players[0], p.players[1]]) : [];
  const paired = new Set(pairs.flat());
  const loose = active.filter((id) => !paired.has(id));
  for (let i = 0; i + 1 < loose.length; i += 2) pairs.push([loose[i]!, loose[i + 1]!]);
  return pairs;
}

function formatTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m ? `${m}m` : ''}`.trim() : `${m}m`;
}

function PlayersBody({ ctx }: { ctx: SessionCtx }) {
  const { state: s, append, sessionId } = ctx;
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [courtside, setCourtside] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  if (s.status !== 'draft') return <Navigate to={`/s/${sessionId}`} replace />;

  const players = activePlayers(s);
  const fixed = s.settings.format === 'doubles' && s.settings.partnerMode === 'fixed';
  const pairs = fixed ? currentPairs(s) : [];
  const odd = fixed && players.length % 2 === 1 ? players.at(-1) : null;
  const problem = startProblem(s);
  const matches = problem ? 0 : previewMatchCount(s);

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast(t('error', { code: errorCode(e) }));
    }
  };

  const add = () =>
    run(async () => {
      const n = name.trim();
      if (!n) return;
      setName('');
      await append({ type: 'add_player', payload: { id: newId(), name: n, via: 'manual' } });
    });

  // Tap one name, then another, to swap their places in the pairs.
  const pick = (id: string) =>
    run(async () => {
      if (!selected) return setSelected(id);
      if (selected === id) return setSelected(null);
      const next = pairs.map((p) => p.map((x) => (x === selected ? id : x === id ? selected : x)) as [string, string]);
      setSelected(null);
      setMoved(id);
      setTimeout(() => setMoved(null), 900);
      await append({ type: 'set_pairs', payload: { pairs: next } });
    });

  const shuffle = () =>
    run(async () => {
      const ids = players.map((p) => p.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j]!, ids[i]!];
      }
      const next: [string, string][] = [];
      for (let i = 0; i + 1 < ids.length; i += 2) next.push([ids[i]!, ids[i + 1]!]);
      await append({ type: 'set_pairs', payload: { pairs: next } });
    });

  const hostPlaying = players.some((p) => p.id === s.hostPlayerId);

  const start = (handToPlayers = false) =>
    run(async () => {
      setCourtside(false);
      if (handToPlayers) await append({ type: 'update_settings', payload: { settings: { ...s.settings, scorerMode: 'players' } } });
      if (fixed) await append({ type: 'set_pairs', payload: { pairs } });
      await append({ type: 'start', payload: {} });
      saveRoster(players.map((p) => p.name));
      nav(`/s/${sessionId}`);
    });

  const onStart = () => {
    if (!hostPlaying && s.settings.scorerMode === 'host') setCourtside(true);
    else void start();
  };

  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? '?';

  return (
    <>
      <h1>{t('players_title')}</h1>
      <p className="muted">{t('players_sub')}</p>
      <Btn
        kind="primary"
        icon="link"
        onClick={async () => {
          if (await copyText(absUrl(`/p/${s.slug}`))) toast(t('copied'));
        }}
      >
        {t('copy_public')}
      </Btn>

      <section>
        <h3>{t('n_in', { n: players.length })}</h3>
        <ol className="list numbered">
          {players.map((p, i) => (
            <li key={p.id} className="row">
              <span className="num">{i + 1}</span>
              <span className="grow">
                {p.name} {p.id === s.hostPlayerId && <span className="tag">{t('host')}</span>}
                {p.deviceId && p.id !== s.hostPlayerId && <span className="tag soft">{t('on_phone')}</span>}
              </span>
              <button className="icon-btn" aria-label={`${t('remove')} ${p.name}`} onClick={() => run(() => append({ type: 'remove_player', payload: { id: p.id } }))}>
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ol>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input value={name} maxLength={40} placeholder={t('add_player_ph')} onChange={(e) => setName(e.target.value)} aria-label={t('add_player_ph')} />
          <Btn kind="dark" icon="plus" type="submit">
            {t('add')}
          </Btn>
        </form>
      </section>

      {fixed && pairs.length > 0 && (
        <section>
          <h3>{t('pairs')}</h3>
          <p className="muted small">{t('pairs_tap_help')}</p>
          <ol className="pairs">
            {pairs.map((pair, i) => (
              <li key={i}>
                <span className="num">{i + 1}</span>
                {pair.map((pid) => (
                  <button
                    key={pid}
                    className={`pair-cell ${moved === pid ? 'moved' : ''} ${selected === pid ? 'selected' : ''}`}
                    aria-pressed={selected === pid}
                    onClick={() => void pick(pid)}
                  >
                    {nameOf(pid)}
                  </button>
                ))}
              </li>
            ))}
          </ol>
          <p className="small" aria-live="polite">
            {selected ? t('swap_with', { name: nameOf(selected) }) : ''}
          </p>
          <Btn icon="shuffle" onClick={shuffle}>
            {t('shuffle')}
          </Btn>
        </section>
      )}

      {!problem && usableCourts(s.settings, players.length) < s.settings.courts && (
        <div className="box warn" role="status">
          <p>{t('capacity_note', { n: players.length, c: usableCourts(s.settings, players.length), courts: s.settings.courts })}</p>
          {s.settings.format === 'doubles' && s.settings.partnerMode === 'rotate' && s.settings.spareCourts !== 'singles' && <p className="small">{t('capacity_singles')}</p>}
          <Btn
            small
            icon="grid"
            onClick={() => run(() => append({ type: 'update_settings', payload: { settings: { ...s.settings, courts: Math.max(1, usableCourts(s.settings, players.length)) } } }))}
          >
            {t('use_n_courts', { c: Math.max(1, usableCourts(s.settings, players.length)) })}
          </Btn>
        </div>
      )}

      <div className="cta-bar">
      {problem ? (
        <div className="box warn" role="alert">
          <p>{t(problem as 'need_2')}</p>
          {problem === 'odd_fixed' && odd && (
            <Btn small icon="shuffle" onClick={() => run(() => append({ type: 'update_settings', payload: { settings: { ...s.settings, partnerMode: 'rotate' } } }))}>
              {t('switch_rotate')}
            </Btn>
          )}
        </div>
      ) : (
        <p className="estimate">{t('estimate', { matches, time: formatTime(estimateMinutes(matches, s.settings.courts, s.settings.rules.gamesTo)) })}</p>
      )}
      <Btn kind="primary" icon="play" onClick={onStart} disabled={!!problem}>
        {t('start')}
      </Btn>
      </div>

      <Sheet open={courtside} onClose={() => setCourtside(false)} title={t('courtside_title')}>
        <p>{t('courtside_body', { n: s.settings.courts })}</p>
        <div className="actions column">
          <Btn kind="primary" icon="check" onClick={() => start(false)}>
            {t('courtside_yes')}
          </Btn>
          <Btn icon="users" onClick={() => start(true)}>
            {t('courtside_no')}
          </Btn>
        </div>
      </Sheet>
    </>
  );
}
