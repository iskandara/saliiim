import { useEffect, useState } from 'react';
import { myPlayer, standings, unitForPlayer, unitName, type SessionState } from '../core/session';
import { useT } from '../i18n';
import { backend } from '../state';
import { Ball, Btn } from '../ui/kit';
import { ResultsList, StandingsTable } from '../ui/session-ui';
import { downloadCanvas, drawSticker, loadLogo, STICKER_FONT } from '../ui/sticker';

/** Closed-session summary. Players get their own sticker; everyone else gets the winner's. */
export function SummaryView({ s, device, sessionId }: { s: SessionState; device: string | null; sessionId: string | null }) {
  const t = useT();
  const table = standings(s);
  const me = myPlayer(s, device);
  const myUnit = me ? unitForPlayer(s, me.id) : null;
  const mineIdx = myUnit ? table.findIndex((r) => r.unit === myUnit) : -1;
  const row = mineIdx >= 0 && table[mineIdx]!.played > 0 ? table[mineIdx]! : table[0];
  const rank = mineIdx >= 0 && table[mineIdx]!.played > 0 ? mineIdx + 1 : 1;
  const date = new Date(s.createdAt ?? Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const gd = (n: number) => (n > 0 ? `+${n}` : String(n));

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const stickerKey = row ? `${row.unit}|${row.wins}|${row.losses}|${row.gamesWon}|${rank}|${t('sticker_winner')}|${t('record')}|${s.settings.name}` : '';
  useEffect(() => {
    if (!row) return;
    let alive = true;
    // Canvas only uses fonts that are already loaded, so wait for the display face first.
    let logo: HTMLImageElement | null = null;
    const draw = () => alive && setCanvas(drawSticker({
      logo,
      session: s.settings.name,
      date,
      label: rank === 1 ? t('sticker_winner') : t('sticker_place', { n: rank, total: table.length }),
      name: unitName(s, row.unit),
      stats: [
        [`${row.wins}-${row.losses}`, t('record')],
        [String(row.gamesWon), t('games_won')],
        [gd(row.gameDiff), t('game_diff')],
      ],
    }));
    Promise.all([
      loadLogo().then((img) => {
        logo = img;
      }),
      document.fonts.load(`900 64px ${STICKER_FONT}`),
      document.fonts.load(`700 40px ${STICKER_FONT}`),
    ]).then(draw, draw);
    return () => {
      alive = false;
    };
  }, [stickerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <section className="court-surface hero">
        <p className="eyebrow">{t('session_closed')}</p>
        <h1>{t('wrap')}</h1>
        <p>
          <b>{s.settings.name}</b>
        </p>
        <p className="small">{t(s.closedBy === 'auto' ? 'auto_closed_note' : 'locked_note')}</p>
        <div className="ball-row" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Ball key={i} size={22} />
          ))}
        </div>
      </section>

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
          <Btn kind="primary" icon="download" onClick={() => {
              downloadCanvas(canvas, `saliiim-${s.slug || 'session'}.png`);
              backend.track('sticker_downloaded', sessionId);
            }}>
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
