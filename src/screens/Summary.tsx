import { useMemo } from 'react';
import { myPlayer, standings, unitForPlayer, unitName, type SessionState } from '../core/session';
import { useT } from '../i18n';
import { Btn } from '../ui/kit';
import { ResultsList, StandingsTable } from '../ui/session-ui';
import { downloadCanvas, drawSticker } from '../ui/sticker';

/** Closed-session summary. Players get their own sticker; everyone else gets the winner's. */
export function SummaryView({ s, device }: { s: SessionState; device: string | null }) {
  const t = useT();
  const table = standings(s);
  const me = myPlayer(s, device);
  const myUnit = me ? unitForPlayer(s, me.id) : null;
  const mineIdx = myUnit ? table.findIndex((r) => r.unit === myUnit) : -1;
  const row = mineIdx >= 0 && table[mineIdx]!.played > 0 ? table[mineIdx]! : table[0];
  const rank = mineIdx >= 0 && table[mineIdx]!.played > 0 ? mineIdx + 1 : 1;
  const date = new Date(s.createdAt ?? Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const gd = (n: number) => (n > 0 ? `+${n}` : String(n));

  const canvas = useMemo(() => {
    if (!row || typeof document === 'undefined') return null;
    return drawSticker({
      session: s.settings.name,
      date,
      label: rank === 1 ? t('sticker_winner') : t('sticker_place', { n: rank, total: table.length }),
      name: unitName(s, row.unit),
      stats: [
        [`${row.wins}-${row.losses}`, t('record')],
        [String(row.gamesWon), t('games_won')],
        [gd(row.gameDiff), t('game_diff')],
      ],
    });
  }, [row, rank, s, date, t, table.length]);

  return (
    <>
      <span className="tag dark">{t('session_closed')}</span>
      <h1>{t('wrap')}</h1>
      <p className="muted">{s.settings.name}</p>
      <p className="small">{t(s.closedBy === 'auto' ? 'auto_closed_note' : 'locked_note')}</p>

      {mineIdx >= 0 && table[mineIdx]!.played > 0 && (
        <div className="stats">
          <div>
            <b>#{rank}</b>
            <span>{t('your_rank')}</span>
          </div>
          <div>
            <b>
              {row!.wins}-{row!.losses}
            </b>
            <span>{t('record')}</span>
          </div>
          <div>
            <b>{row!.gamesWon}</b>
            <span>{t('games_won')}</span>
          </div>
          <div className="hl">
            <b>{gd(row!.gameDiff)}</b>
            <span>{t('game_diff')}</span>
          </div>
        </div>
      )}

      {canvas && (
        <section>
          <div className="sticker-preview">
            <img src={canvas.toDataURL('image/png')} alt={`${unitName(s, row!.unit)} sticker`} />
          </div>
          <p className="small">{t('sticker_caption')}</p>
          <Btn kind="primary" icon="download" onClick={() => downloadCanvas(canvas, `saliiim-${s.slug || 'session'}.png`)}>
            {t('download')}
          </Btn>
        </section>
      )}

      <StandingsTable s={s} highlight={myUnit} title={t('final_standings')} />
      <section>
        <h3>{t('all_results')}</h3>
        <ResultsList s={s} />
      </section>
    </>
  );
}
