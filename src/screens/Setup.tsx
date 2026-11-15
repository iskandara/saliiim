import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DEFAULT_SETTINGS, MAX_COURTS, type Rules, type Settings } from '../core/types';
import { useT } from '../i18n';
import { backend, lastRoster, remember } from '../state';
import { newId } from '../state/backend';
import { errorCode } from '../state/useSession';
import { Btn, Field, Icon, Page, Seg, Sheet, Stepper, useToast } from '../ui/kit';

const LAST = 'saliiim:last-settings';

function lastSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(LAST);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function Setup() {
  const t = useT();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const repeat = params.get('repeat') === '1';
  const [s, setS] = useState<Settings>(() => (repeat && lastSettings()) || DEFAULT_SETTINGS);
  const [advanced, setAdvanced] = useState(false);
  const [tried, setTried] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const setRule = <K extends keyof Rules>(k: K, v: Rules[K]) => setS((x) => ({ ...x, rules: { ...x.rules, [k]: v } }));
  const hostErr = tried && !s.hostName.trim() ? t('your_name_err') : null;
  const nameErr = tried && !s.name.trim() ? t('session_name_err') : null;
  const tbAt = s.rules.margin === 'first_to' ? s.rules.gamesTo - 1 : s.rules.gamesTo;
  const rulesSummary = [
    t(s.rules.deuce),
    t(s.rules.margin === 'first_to' ? 'rules_margin_first' : 'rules_margin_by2', { n: s.rules.gamesTo }),
    s.rules.tiebreak ? t('rules_tb', { to: s.rules.tiebreakTo, a: tbAt }) : t('rules_no_tb'),
  ].join(' · ');

  const next = () => {
    setTried(true);
    if (!s.hostName.trim()) return document.getElementById('host-name')?.focus();
    if (!s.name.trim()) return document.getElementById('session-name')?.focus();
    setReview(true);
  };

  const create = async () => {
    setBusy(true);
    try {
      const settings = { ...s, name: s.name.trim(), hostName: s.hostName.trim() };
      const hostPlayer = { id: newId(), name: settings.hostName };
      const created = await backend.createSession(settings, hostPlayer);
      localStorage.setItem(LAST, JSON.stringify(settings));
      remember({ id: created.id, slug: created.slug, name: settings.name, role: 'host', hostKey: created.hostKey, at: new Date().toISOString() });
      if (repeat) {
        backend.track('session_repeated', created.id);
        for (const name of lastRoster().filter((n) => n !== settings.hostName)) {
          await backend.append(created.id, { type: 'add_player', payload: { id: newId(), name, via: 'manual' } });
        }
      }
      nav(`/s/${created.id}/players`);
    } catch (e) {
      const code = errorCode(e);
      toast(code === 'anonymous_auth_disabled' || code === 'captcha_failed' ? t(code) : t('error', { code }));
      setBusy(false);
    }
  };

  const rows: [string, string][] = [
    [t('host'), s.hostName],
    [t('session_name'), s.name],
    [t('format'), t(s.format)],
    ...(s.format === 'doubles' ? [[t('partners'), t(s.partnerMode)] as [string, string]] : []),
    [t('courts'), String(s.courts)],
    ...(s.format === 'doubles' && s.partnerMode === 'rotate' && s.courts > 1
      ? [[t('spare_courts'), t(s.spareCourts === 'singles' ? 'spare_singles' : 'spare_empty')] as [string, string]]
      : []),
    [t('match_ends'), t('first_to_n', { n: s.rules.gamesTo })],
    [t('at_deuce'), t(s.rules.deuce)],
    [t('at_all', { a: s.rules.gamesTo - 1 }), t(s.rules.margin === 'first_to' ? 'next_game_wins' : 'win_by_2')],
    [t('tiebreak'), s.rules.tiebreak ? t('points_n', { n: s.rules.tiebreakTo }) : t('off')],
    [t('rounds'), s.maxRounds ? String(s.maxRounds) : t('rounds_auto')],
    [t('who_scores'), t(s.scorerMode === 'host' ? 'host_only' : 'players_on_court')],
  ];

  return (
    <Page header="full">
      <h1>{t('new_session')}</h1>
      <section className="panel">
        <h3>{t('setup_basics')}</h3>
      <Field label={t('your_name')} error={hostErr}>
        <input id="host-name" value={s.hostName} maxLength={40} placeholder={t('your_name_ph')} onChange={(e) => set('hostName', e.target.value)} />
      </Field>
      <Field label={t('session_name')} error={nameErr}>
        <input id="session-name" value={s.name} maxLength={60} placeholder={t('session_name_ph')} onChange={(e) => set('name', e.target.value)} />
      </Field>

      </section>

      <section className="panel">
        <h3>{t('setup_play')}</h3>
      <div className="field">
        <span className="field-label">{t('format')}</span>
        <Seg label={t('format')} value={s.format} options={[['singles', t('singles')], ['doubles', t('doubles')]]} onChange={(v) => set('format', v)} />
      </div>
      {s.format === 'doubles' && (
        <div className="field">
          <span className="field-label">{t('partners')}</span>
          <Seg label={t('partners')} value={s.partnerMode} options={[['rotate', t('rotate')], ['fixed', t('fixed')]]} onChange={(v) => set('partnerMode', v)} />
          <span className="help">{t(s.partnerMode === 'rotate' ? 'rotate_help' : 'fixed_help')}</span>
        </div>
      )}
      <div className="field">
        <span className="field-label">{t('courts')}</span>
        <Stepper label={t('courts')} value={s.courts} min={1} max={MAX_COURTS} onChange={(n) => set('courts', n)} />
      </div>
      {s.format === 'doubles' && s.partnerMode === 'rotate' && s.courts > 1 && (
        <div className="field">
          <span className="field-label">{t('spare_courts')}</span>
          <Seg label={t('spare_courts')} value={s.spareCourts ?? 'empty'} options={[['singles', t('spare_singles')], ['empty', t('spare_empty')]]} onChange={(v) => set('spareCourts', v)} />
          <span className="help">{t('spare_help')}</span>
        </div>
      )}
      <div className="field">
        <span className="field-label">{t('match_ends')}</span>
        <Seg label={t('match_ends')} value={s.rules.gamesTo} options={[[4, t('first_to_n', { n: 4 })], [6, t('first_to_n', { n: 6 })]]} onChange={(v) => setRule('gamesTo', v)} />
      </div>

      </section>

      <section className="panel">
        <h3>{t('setup_scoring')}</h3>
      <div className="advanced">
        <button className="how-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
          <span>
            <b>{t('advanced')}</b>
            <span className="small muted">{rulesSummary}</span>
          </span>
          <Icon name={advanced ? 'up' : 'down'} />
        </button>
        {advanced && (
          <div className="how-body">
            <div className="field">
              <span className="field-label">{t('at_deuce')}</span>
              <Seg label={t('at_deuce')} value={s.rules.deuce} options={[['one_deuce', t('one_deuce')], ['advantage', t('advantage')], ['no_ad', t('no_ad')]]} onChange={(v) => setRule('deuce', v)} />
              <span className="help">{t(`${s.rules.deuce}_help` as 'no_ad_help')}</span>
            </div>
            <div className="field">
              <span className="field-label">{t('at_all', { a: s.rules.gamesTo - 1 })}</span>
              <Seg label={t('at_all', { a: s.rules.gamesTo - 1 })} value={s.rules.margin} options={[['first_to', t('next_game_wins')], ['win_by_2', t('win_by_2')]]} onChange={(v) => setRule('margin', v)} />
            </div>
            <div className="field">
              <span className="field-label">{t('tiebreak')}</span>
              <Seg label={t('tiebreak')} value={s.rules.tiebreak ? 'on' : 'off'} options={[['off', t('off')], ['on', t('on')]]} onChange={(v) => setRule('tiebreak', v === 'on')} />
              {s.rules.tiebreak && (
                <>
                  <Seg label={t('tiebreak_to')} value={s.rules.tiebreakTo} options={[[7, t('points_n', { n: 7 })], [10, t('points_n', { n: 10 })]]} onChange={(v) => setRule('tiebreakTo', v)} />
                  <span className="help">{t('tiebreak_help', { a: tbAt })}</span>
                </>
              )}
            </div>
            <div className="field">
              <span className="field-label">{t('rounds')}</span>
              <Seg
                label={t('rounds')}
                value={s.maxRounds ?? 0}
                options={[[0, t('rounds_auto')], [3, '3'], [4, '4'], [5, '5'], [6, '6']]}
                onChange={(v) => set('maxRounds', v === 0 ? null : v)}
              />
              <span className="help">{t('rounds_help')}</span>
            </div>
          </div>
        )}
      </div>

      <div className="field">
        <span className="field-label">{t('who_scores')}</span>
        <Seg label={t('who_scores')} value={s.scorerMode} options={[['host', t('host_only')], ['players', t('players_on_court')]]} onChange={(v) => set('scorerMode', v)} />
        <span className="help">{t(s.scorerMode === 'host' ? 'host_only_help' : 'players_help')}</span>
      </div>

      </section>

      <div className="cta-bar">
      <Btn kind="primary" icon="right" onClick={next}>
        {t('next_players')}
      </Btn>
      </div>

      <Sheet open={review} onClose={() => setReview(false)} title={t('review_title')}>
        <p className="muted small">{t('review_sub')}</p>
        <dl className="review">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="actions">
          <Btn icon="left" onClick={() => setReview(false)}>
            {t('adjust')}
          </Btn>
          <Btn kind="primary" icon="right" onClick={create} disabled={busy}>
            {t('continue')}
          </Btn>
        </div>
      </Sheet>
    </Page>
  );
}
