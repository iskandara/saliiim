import { useState, type ReactNode } from 'react';
import { pointLabels } from '../core/scoring';
import {
  biggestWin, liveMatchOnCourt, queue, sideName, standings, unitName, waitingFor,
  type MatchState, type SessionState,
} from '../core/session';
import { useT } from '../i18n';
import { Icon } from './kit';

export function LiveBadge() {
  const t = useT();
  return <span className="live-badge">● {t('live')}</span>;
}

/** Compact two-row scoreboard used on the courts board, invite page and live view. */
export function MiniScore({ s, m }: { s: SessionState; m: MatchState }) {
  const labels = pointLabels(m.score);
  const finished = m.result;
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
                <span>{m.score.tiebreak ? 'TB' : 'Pts'}</span> <b>{pts}</b>
              </div>
            )}
          </div>
          <div className="mini-games">{games}</div>
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
    <section>
      <h3>{t('next_up')}</h3>
      <ul className="list">
        {q.map((m) => (
          <li key={m.id} className="row">
            <span>
              {sideName(s, m.a)} <span className="muted">vs</span> {sideName(s, m.b)}
            </span>
            {render?.(m)}
          </li>
        ))}
      </ul>
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
            <span className="wins">
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
              {m.result!.reason !== 'played' && <span className="tag">{t(m.result!.reason === 'edited' ? 'edited' : m.result!.reason === 'awarded' ? 'awarded' : 'kept')}</span>}
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
