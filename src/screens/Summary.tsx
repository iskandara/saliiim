import { useEffect, useState } from 'react';
import { nameOf, myPlayer, standings, unitForPlayer, unitName, type SessionState } from '../core/session';
import { useT } from '../i18n';
import { backend } from '../state';
import { Ball, Btn } from '../ui/kit';
import { ClaimCard, LevelChanges } from '../ui/account';
import { FeedbackForm } from '../ui/feedback';
import { ResultsList, StandingsTable } from '../ui/session-ui';
import { canShareImage, drawSticker, loadLogo, needsDarkPreview, shareOrDownload, STICKER_FONT, STICKER_THEMES, themeSwatch, type StickerTheme } from '../ui/sticker';

const THEME_KEY = 'saliiim:sticker-theme';

function savedTheme(): StickerTheme {
  try {
    const v = localStorage.getItem(THEME_KEY) as StickerTheme | null;
    return v && STICKER_THEMES.includes(v) ? v : 'court';
  } catch {
    return 'court';
  }
}

/** Closed-session summary. Players get their own sticker; everyone else gets the winner's. */
export function SummaryView({ s, device, sessionId }: { s: SessionState; device: string | null; sessionId: string | null }) {
  const t = useT();
  const table = standings(s);
  const me = myPlayer(s, device);
  const myUnit = me ? unitForPlayer(s, me.id) : null;
  const mineIdx = myUnit ? table.findIndex((r) => r.unit === myUnit) : -1;
  const played = table.filter((r) => r.played > 0);
  // Whose sticker: yours if you played; otherwise anyone can pick their own name (no claim needed,
  // so players who never tapped "That's me" still get theirs after the session closes).
  const [pick, setPick] = useState<string | null>(null);
  const chosen = pick ?? (mineIdx >= 0 && table[mineIdx]!.played > 0 ? table[mineIdx]!.unit : table[0]?.unit);
  const pickIdx = Math.max(0, table.findIndex((r) => r.unit === chosen));
  const row = table[pickIdx];
  const rank = pickIdx + 1;
  const date = new Date(s.createdAt ?? Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const gd = (n: number) => (n > 0 ? `+${n}` : String(n));

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  // Ready before the tap: the share sheet only opens straight from a tap, with no waiting in between.
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    setBlob(null);
    canvas?.toBlob((b) => setBlob(b), 'image/png');
  }, [canvas]);
  const share = canShareImage();
  const [theme, setTheme] = useState<StickerTheme>(savedTheme);
  const pickTheme = (v: StickerTheme) => {
    setTheme(v);
    try {
      localStorage.setItem(THEME_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const stickerKey = row ? `${theme}|${row.unit}|${row.wins}|${row.losses}|${row.gamesWon}|${rank}|${t('sticker_winner')}|${t('sticker_promo')}|${s.settings.name}` : '';
  useEffect(() => {
    if (!row) return;
    let alive = true;
    // Canvas only uses fonts that are already loaded, so wait for the display face first.
    let logo: HTMLImageElement | null = null;
    const draw = () => alive && setCanvas(drawSticker({
      theme,
      logo,
      promo: t('sticker_promo'),
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
      loadLogo(theme).then((img) => {
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

      {me && <ClaimCard sessionId={sessionId} closedAt={s.lastAt ?? null} />}
      <LevelChanges sessionId={sessionId} nameOf={(id) => (id ? nameOf(s, id) : '?')} />

      {mineIdx >= 0 && table[mineIdx]!.played > 0 && (pick === null || pick === myUnit) && (
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
          {played.length > 1 && (
            <div className="field sticker-for">
              <label className="field-label" htmlFor="sticker-for">
                {t('sticker_for')}
              </label>
              <select id="sticker-for" value={chosen} onChange={(e) => setPick(e.target.value)}>
                {played.map((r) => (
                  <option key={r.unit} value={r.unit}>
                    {unitName(s, r.unit)}
                  </option>
                ))}
              </select>
              {mineIdx < 0 && <span className="small muted">{t('sticker_for_help')}</span>}
            </div>
          )}
          <h3>{t('sticker_style')}</h3>
          <div className="swatches" role="radiogroup" aria-label={t('sticker_style')}>
            {STICKER_THEMES.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={theme === v}
                className={theme === v ? 'on' : ''}
                onClick={() => pickTheme(v)}
              >
                <span className={`dot ${v.startsWith('clear') ? 'clear' : ''}`} style={{ background: themeSwatch(v) }} aria-hidden="true" />
                <span>{t(`st_${v}` as 'st_court')}</span>
              </button>
            ))}
          </div>
          <div className={`sticker-preview ${needsDarkPreview(theme) ? 'on-dark' : ''}`}>
            <img src={canvas.toDataURL('image/png')} alt={`${unitName(s, row!.unit)} sticker`} />
          </div>
          <p className="small">{t('sticker_caption')}</p>
          <Btn
            kind="primary"
            icon="download"
            disabled={!blob}
            onClick={() => {
              if (!blob) return;
              const name = `saliiim-${(unitName(s, row!.unit) || 'sticker').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
              void shareOrDownload(blob, name).then((r) => r !== 'cancelled' && backend.track('sticker_downloaded', sessionId));
            }}
          >
            {t(share ? 'sticker_save' : 'download')}
          </Btn>
          {share && <p className="small muted">{t('sticker_save_help')}</p>}
        </section>
      )}

      <FeedbackForm source="summary" sessionId={sessionId} title={t('fb_title')} />

      <StandingsTable s={s} highlight={myUnit} title={t('final_standings')} />
      <section>
        <h3>{t('all_results')}</h3>
        <ResultsList s={s} />
      </section>
    </>
  );
}
