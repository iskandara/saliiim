import { useEffect, useState, type ReactNode } from 'react';
import { finalScoreProblem, maxGames, pointLabels } from '../core/scoring';
import {
  biggestWin, canPostpone, liveMatchOnCourt, skippedMatches, queue, sideName, standings, unitName, waitingFor,
  type MatchState, type SessionState,
} from '../core/session';
import type { Rules } from '../core/types';
import { useT } from '../i18n';
import { Btn, Icon, Sheet, Stepper } from './kit';

export function LiveBadge() {
  const t = useT();
  return <span className="live-badge">● {t('live')}</span>;
}

/** Compact two-row scoreboard used on the courts board, invite page and live view. */
export function MiniScore({ s, m }: { s: SessionState; m: MatchState }) {
  const t = useT();
  const labels = pointLabels(m.score);
  const finished = m.result ?? m.entered;
  const rows: [string[], number, string][] = [
    [m.a, finished ? finished.gamesA : m.score.games[0], labels[0]],
    [m.b, finished ? finished.gamesB : m.score.games[1], labels[1]],
  ];
  return (
    <div className="mini">
      {rows.map(([side, games, pts], i) => (
        <div key={i} className={`mini-row ${i === 1 ? 'alt' : ''}`}>
          <div>
            <div className="mini-name">{sideName(s, side)}</div>
            {!finished && (
              <div className="mini-points">
                <span>{m.score.tiebreak ? 'TB' : t('pts')}</span>{' '}
                <b key={pts} className="flash">
                  {pts}
                </b>
              </div>
            )}
          </div>
          {/* Re-keyed so a changed number rolls in, confirming the point landed. */}
          <div className="mini-games digits" key={games}>
            {games}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CourtsList({ s, render }: { s: SessionState; render?: (court: number, m: MatchState | null) => ReactNode }) {
  const t = useT();
  const waiting = waitingFor(s);
  return (
    <div className="courts">
      {Array.from({ length: s.settings.courts }, (_, i) => i + 1).map((c) => {
        const m = liveMatchOnCourt(s, c);
        return (
          <section key={c} className="court">
            <h3>{t('court_n', { n: c })}</h3>
            {m ? (
              <MiniScore s={s} m={m} />
            ) : (
              <div className="box muted">
                {t('free_court')} {queue(s).length ? (waiting.length ? t('waiting_for', { names: waiting.join(', ') }) : '') : t('no_more')}
              </div>
            )}
            {render?.(c, m)}
          </section>
        );
      })}
    </div>
  );
}

export function NextUp({ s, render }: { s: SessionState; render?: (m: MatchState) => ReactNode }) {
  const t = useT();
  const q = queue(s).slice(0, 3);
  if (!q.length) return null;
  return (
    <section className="next-up">
      <h3>{t('next_up')}</h3>
      <ol className="next-list">
        {q.map((m, i) => (
          <li key={m.id} className={`next-row ${i === 0 ? 'first' : ''}`}>
            <span className="next-no" aria-hidden="true">
              {i + 1}
            </span>
            <span className="next-names">
              <b>{sideName(s, m.a)}</b> <span className="vs">{t('vs')}</span> <b>{sideName(s, m.b)}</b>
            </span>
            {render?.(m)}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Notices({ s }: { s: SessionState }) {
  const t = useT();
  const last = s.notices.at(-1);
  if (!last || s.status !== 'live') return null;
  return (
    <div className="notice" role="status">
      <Icon name="info" size={16} />
      <span>{t(last.kind === 'host_stepped_off' ? 'notice_stepped' : 'notice_handed', { name: last.name })}</span>
    </div>
  );
}

export function StandingsTable({ s, highlight, title }: { s: SessionState; highlight?: string | null; title?: string }) {
  const t = useT();
  const rows = standings(s);
  const fixed = s.settings.format === 'doubles' && s.settings.partnerMode === 'fixed';
  // No results yet: list everyone unranked, so nobody looks like they lead.
  if (!rows.some((r) => r.played > 0)) {
    return (
      <section>
        {title && <h3>{title}</h3>}
        <p className="box muted">{t('standings_empty')}</p>
        <ul className="list unranked">
          {rows.map((r) => (
            <li key={r.unit} className={`row ${highlight === r.unit ? 'me' : ''}`}>
              <span className="grow">
                {unitName(s, r.unit)} {highlight === r.unit && <span className="muted">({t('you')})</span>}
              </span>
            </li>
          ))}
        </ul>
        <HowStandings />
      </section>
    );
  }
  return (
    <section>
      {title && <h3>{title}</h3>}
      <p className="muted small">{t(fixed ? 'by_pair' : 'by_player')}</p>
      <ol className="standings">
        {rows.map((r, i) => (
          <li key={r.unit} className={`${i === 0 && r.played ? 'first' : ''} ${highlight === r.unit ? 'me' : ''}`}>
            <span className="rank">{i + 1}</span>
            <span className="who">
              <b>
                {unitName(s, r.unit)} {highlight === r.unit && <span className="muted">({t('you')})</span>}
              </b>
              <span className="small">{t('played_gd', { p: r.played, gd: r.gameDiff > 0 ? `+${r.gameDiff}` : r.gameDiff })}</span>
            </span>
            <span className="wins digits">
              {r.wins}-{r.losses}
            </span>
          </li>
        ))}
      </ol>
      <HowStandings />
    </section>
  );
}

export function HowStandings() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="how">
      <button className="how-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <b>{t('how_title')}</b>
          <span className="small muted">{t('how_sub')}</span>
        </span>
        <Icon name={open ? 'up' : 'down'} />
      </button>
      {open && (
        <div className="how-body">
          <ol className="ladder">
            <li>
              <b>{t('how_1')}</b>
              <span className="small muted">{t('how_1b')}</span>
            </li>
            <li className="arrow small muted">{t('tied')}</li>
            <li>
              <b>{t('how_2')}</b>
              <span className="small muted">{t('how_2b')}</span>
            </li>
            <li className="arrow small muted">{t('still_tied')}</li>
            <li>
              <b>{t('how_3')}</b>
            </li>
          </ol>
          <p className="small">{t('how_note')}</p>
        </div>
      )}
    </div>
  );
}

export function ResultsList({ s, onEdit }: { s: SessionState; onEdit?: (m: MatchState) => void }) {
  const t = useT();
  const done = s.matches.filter((m) => m.status === 'done' && m.result);
  const best = biggestWin(s);
  if (!done.length) return <p className="muted">{t('no_results')}</p>;
  return (
    <>
      {best?.result && (
        <p className="small">
          <b>{t('biggest_win')}:</b> {sideName(s, best.result.winner === 0 ? best.a : best.b)} {Math.max(best.result.gamesA, best.result.gamesB)}-
          {Math.min(best.result.gamesA, best.result.gamesB)}
        </p>
      )}
      <ul className="results">
        {done.map((m) => (
          <li key={m.id}>
            <span className={`l ${m.result!.winner === 0 ? 'win' : ''}`}>{sideName(s, m.a)}</span>
            <span className="score">
              {m.result!.gamesA}-{m.result!.gamesB}
              {m.result!.reason !== 'played' && <span className="tag">{t(m.result!.reason)}</span>}
            </span>
            <span className={`r ${m.result!.winner === 1 ? 'win' : ''}`}>{sideName(s, m.b)}</span>
            {onEdit && (
              <button className="link-btn" onClick={() => onEdit(m)}>
                {t('edit')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function ProgressLine({ s }: { s: SessionState }) {
  const t = useT();
  const done = s.matches.filter((m) => m.status === 'done').length;
  const skipped = s.matches.filter((m) => m.status === 'skipped').length;
  return (
    <p className="muted small">
      {t('played_of', { done, total: s.matches.length - skipped })}
      {skipped > 0 && ` · ${t('skipped_n', { n: skipped })}`}
    </p>
  );
}

/** Type in the final games after a match, instead of scoring it live. */
/** The rule-check message for a final score, or null when the score could happen. */
export function finalScoreMessage(t: ReturnType<typeof useT>, rules: Rules, gamesA: number, gamesB: number, allowUnfinished = false): string | null {
  const problem = finalScoreProblem(gamesA, gamesB, rules);
  if (allowUnfinished && (problem === 'short' || problem === 'lead')) return null;
  const n = rules.gamesTo;
  switch (problem) {
    case null:
      return null;
    case 'tie':
      return t('enter_tie');
    case 'short':
      return t('enter_short', { n });
    case 'over_first':
      return t('enter_over_first', { n });
    case 'lead':
      return t('enter_lead');
    case 'over_lead':
      return t('enter_over_lead');
    case 'over_tb':
      return t('enter_over_tb', { n, m: n + 1 });
  }
}

export function EnterScoreSheet({ s, m, open, onClose, onSave, editing = false }: {
  s: SessionState;
  m: MatchState;
  open: boolean;
  onClose: () => void;
  onSave: (gamesA: number, gamesB: number) => void;
  /** Correcting a finished result instead of entering a new one. */
  editing?: boolean;
}) {
  const t = useT();
  const rules = s.settings.rules;
  const top = maxGames(rules);
  const start = (editing && m.result) || m.entered || { gamesA: m.score.games[0], gamesB: m.score.games[1] };
  const [a, setA] = useState(start.gamesA);
  const [b, setB] = useState(start.gamesB);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (open) {
      setA(start.gamesA);
      setB(start.gamesB);
      setTried(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // A result settled when someone left mid-match may stay unfinished.
  const problem = finalScoreMessage(t, rules, a, b, editing && (m.result?.reason === 'kept' || m.result?.reason === 'awarded'));
  // A tie or a score past the rules shows straight away; "not finished yet" waits for Save,
  // so it doesn't nag while the steppers are still moving up.
  const shown = problem && (tried || a === b || Math.max(a, b) > rules.gamesTo) ? problem : null;
  return (
    <Sheet open={open} onClose={onClose} title={t(editing ? 'edit_title' : 'enter_title')}>
      <p className="small muted">
        {!editing && t('enter_help')} <b>{t(rules.margin === 'win_by_2' ? 'enter_rule_lead' : 'enter_rule', { n: rules.gamesTo })}</b>
      </p>
      {([
        [m.a, a, setA],
        [m.b, b, setB],
      ] as const).map(([side, value, set], i) => (
        <div key={i} className="enter-row">
          <span className="grow">
            <b>{sideName(s, side)}</b>
          </span>
          <Stepper label={t('enter_games', { team: sideName(s, side) })} value={value} min={0} max={top} onChange={set} />
        </div>
      ))}
      {shown && (
        <p className="field-error" role="alert">
          {shown}
        </p>
      )}
      <div className="actions">
        <Btn icon="left" onClick={onClose}>
          {t('cancel')}
        </Btn>
        <Btn
          kind="primary"
          icon="check"
          disabled={a === b}
          onClick={() => {
            setTried(true);
            if (!problem) onSave(a, b);
          }}
        >
          {t(editing ? 'save' : 'enter_save')}
        </Btn>
      </div>
    </Sheet>
  );
}

/** Confirm before skipping. Offers "play it later" when another match can go first. */
export function SkipSheet({ s, m, onClose, onSkip, onPostpone }: {
  s: SessionState;
  m: MatchState | null;
  onClose: () => void;
  onSkip: (m: MatchState) => void;
  onPostpone: (m: MatchState) => void;
}) {
  const t = useT();
  const later = !!m && canPostpone(s, m);
  return (
    <Sheet open={!!m} onClose={onClose} title={t('skip_title')}>
      {m && <p>{t(m.inputs.length ? 'skip_body' : 'skip_body_unplayed', { a: sideName(s, m.a), b: sideName(s, m.b) })}</p>}
      {later && <p className="small muted">{t('postpone_help')}</p>}
      <div className="actions column">
        {later && (
          <Btn kind="primary" icon="clock" onClick={() => m && onPostpone(m)}>
            {t('postpone')}
          </Btn>
        )}
        <Btn kind="danger" icon="skip" onClick={() => m && onSkip(m)}>
          {t('skip')}
        </Btn>
        <Btn icon="left" onClick={onClose}>
          {t('cancel')}
        </Btn>
      </div>
    </Sheet>
  );
}

/** Skipped matches, with "play again" for the ones whose players are all still here. */
export function SkippedList({ s, onReturn }: { s: SessionState; onReturn?: (m: MatchState) => void }) {
  const t = useT();
  const rows = skippedMatches(s);
  if (!rows.length) return null;
  return (
    <details className="skipped">
      <summary>
        <h3>{t('skipped_title', { n: rows.length })}</h3>
      </summary>
      <ul className="list">
        {rows.map(({ match: m, canReturn }) => (
          <li key={m.id} className="row">
            <span className="grow">
              {sideName(s, m.a)} <span className="muted">{t('vs')}</span> {sideName(s, m.b)}
            </span>
            {onReturn &&
              (canReturn ? (
                <button className="link-btn" onClick={() => onReturn(m)}>
                  {t('play_again')}
                </button>
              ) : (
                <span className="small muted">{t('someone_left')}</span>
              ))}
          </li>
        ))}
      </ul>
    </details>
  );
}
