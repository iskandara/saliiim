import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useT } from '../i18n';
import { backend } from '../state';
import { useAccount } from '../state/account';
import type { StartLevel } from '../state/backend';
import { errorCode } from '../state/useSession';
import { Btn, Field, Icon, Page } from '../ui/kit';

const LEVELS: [StartLevel, string][] = [
  ['beginner', '2.0'],
  ['intermediate', '3.0'],
  ['advanced', '4.0'],
  ['competitive', '5.0'],
];

/** First sign-in: confirm the name and pick a starting level. With ?edit=1 it edits the same two things. */
export function Welcome() {
  const t = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { ready, account, profile, setProfile } = useAccount();
  const editing = params.get('edit') === '1';
  const next = params.get('next');
  const [name, setName] = useState('');
  const [level, setLevel] = useState<StartLevel>('intermediate');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !account) return;
    setName(profile?.name ?? account.name);
    if (profile) setLevel(profile.startLevel);
  }, [ready, account, profile]);

  if (!ready) return <Page>{t('loading')}</Page>;
  if (!account) return <Navigate to="/" replace />;
  // Only the first counted match fixes the level; until then it can still be changed.
  const locked = !!profile && profile.ratedMatches > 0;
  const nameErr = tried && !name.trim() ? t('name_needed') : null;

  const save = async () => {
    setTried(true);
    if (!name.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const p = await backend.saveProfile({ name: name.trim(), ...(locked ? {} : { startLevel: level }) });
      setProfile(p);
      nav(next?.startsWith('/') && next !== '/welcome' ? next : '/', { replace: true });
    } catch (e) {
      setProblem(t('error', { code: errorCode(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page header="full">
      <h1>{editing && profile ? t('edit_profile') : t('welcome_title')}</h1>
      {!(editing && profile) && <p className="muted">{t('welcome_sub')}</p>}
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <section className="card stack">
          <Field label={t('your_name')} error={nameErr}>
            <input value={name} maxLength={40} autoComplete="name" onChange={(e) => setName(e.target.value)} aria-invalid={!!nameErr || undefined} />
          </Field>
          <p className="small muted">{t('your_name_hint')}</p>
        </section>

        <section className="card stack">
          <div>
            <h3>{t('start_level')}</h3>
            <p className="small muted">{locked ? t('start_level_locked') : t('start_level_help')}</p>
          </div>
          <div className="level-picks" role="radiogroup" aria-label={t('start_level')}>
            {LEVELS.map(([v, n]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={level === v}
                disabled={locked}
                className={`level-pick ${level === v ? 'on' : ''}`}
                onClick={() => setLevel(v)}
              >
                <span className="level-no">{n}</span>
                <span>
                  <b>{t(`lvl_${v}`)}</b>
                  <span className="small muted">{t(`lvl_${v}_d`)}</span>
                </span>
                {level === v && <Icon name="check" size={18} />}
              </button>
            ))}
          </div>
        </section>

        {problem && (
          <p className="field-error" role="alert">
            <Icon name="info" size={14} /> {problem}
          </p>
        )}
        <div className="cta-bar">
          <Btn kind="primary" icon="check" type="submit" disabled={busy}>
            {editing && profile ? t('save') : t('welcome_save')}
          </Btn>
        </div>
      </form>
    </Page>
  );
}
