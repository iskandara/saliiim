import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useT } from '../i18n';
import { backend } from '../state';
import { useAccount } from '../state/account';
import type { Profile, StartLevel } from '../state/backend';
import { errorCode } from '../state/useSession';
import { Btn, Field, Icon, Page, Seg, Sheet, useToast } from '../ui/kit';

type Draft = Omit<Profile, 'id' | 'rating' | 'ratedMatches'>;

function Switch({ id, label, help, checked, onChange }: { id: string; label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch-row" htmlFor={id}>
      <span className="grow">
        <b>{label}</b>
        {help && <span className="small muted">{help}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** /settings: profile details, who can see what, sign out, delete account. */
export function SettingsPage() {
  const t = useT();
  const toast = useToast();
  const { ready, account, profile, setProfile, signOut } = useAccount();
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (profile && !d) {
      const { id: _id, rating: _r, ratedMatches: _m, ...rest } = profile;
      setD(rest);
    }
  }, [profile, d]);

  if (!ready) return <Page header="full">{t('loading')}</Page>;
  if (!account) return <Navigate to="/" replace />;
  if (!profile || !d) return <Page header="full">{t('loading')}</Page>;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const locked = profile.ratedMatches > 0;

  const save = async () => {
    if (!d.name.trim()) return setProblem(t('name_needed'));
    setBusy(true);
    setProblem(null);
    try {
      const { startLevel, ...rest } = d;
      const p = await backend.saveProfile({ ...rest, name: d.name.trim(), city: d.city?.trim() || null, ...(locked ? {} : { startLevel }) });
      setProfile(p);
      toast(t('saved'));
    } catch (e) {
      setProblem(t('error', { code: errorCode(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page header="full">
      <h1>{t('st_title')}</h1>
      <Link className="small" to={`/u/${account.id}`}>
        {t('st_view_profile')}
      </Link>
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <section className="panel stack">
          <h3>{t('st_basics')}</h3>
          <Field label={t('your_name')}>
            <input value={d.name} maxLength={40} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('st_city')}>
            <input value={d.city ?? ''} maxLength={60} placeholder={t('st_city_ph')} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <div className="field">
            <span className="field-label">{t('st_hand')}</span>
            <Seg label={t('st_hand')} value={d.hand ?? 'none'} options={[['right', t('hand_right')], ['left', t('hand_left')], ['none', t('st_skip')]]} onChange={(v) => set('hand', v === 'none' ? null : v)} />
          </div>
          <div className="field">
            <span className="field-label">{t('st_format')}</span>
            <Seg
              label={t('st_format')}
              value={d.formatPref ?? 'none'}
              options={[['singles', t('singles')], ['doubles', t('doubles')], ['both', t('st_both')], ['none', t('st_skip')]]}
              onChange={(v) => set('formatPref', v === 'none' ? null : v)}
            />
          </div>
          <div className="field">
            <span className="field-label">{t('start_level')}</span>
            {locked ? (
              <p className="small muted">{t('start_level_locked')}</p>
            ) : (
              <Seg<StartLevel>
                label={t('start_level')}
                value={d.startLevel}
                options={(['beginner', 'intermediate', 'advanced', 'competitive'] as const).map((v) => [v, t(`lvl_${v}`)])}
                onChange={(v) => set('startLevel', v)}
              />
            )}
          </div>
        </section>

        <section className="panel stack">
          <h3>{t('st_visibility')}</h3>
          <Switch id="sw-public" label={t('st_public')} help={t(d.isPublic ? 'st_public_on' : 'st_public_off')} checked={d.isPublic} onChange={(v) => set('isPublic', v)} />
          {d.isPublic && (
            <>
              <p className="small muted">{t('st_sections')}</p>
              <Switch id="sw-basics" label={t('st_sec_basics')} checked={d.showBasics} onChange={(v) => set('showBasics', v)} />
              <Switch id="sw-stats" label={t('pf_stats')} checked={d.showStats} onChange={(v) => set('showStats', v)} />
              <Switch id="sw-h2h" label={t('pf_h2h')} checked={d.showH2h} onChange={(v) => set('showH2h', v)} />
              <Switch id="sw-history" label={t('pf_history')} checked={d.showHistory} onChange={(v) => set('showHistory', v)} />
            </>
          )}
        </section>

        {problem && (
          <p className="field-error" role="alert">
            <Icon name="info" size={14} /> {problem}
          </p>
        )}
        {/* Not sticky: a bar that moves when the keyboard closes would catch the tap meant for the form. */}
        <div className="form-end">
          <Btn kind="primary" icon="check" type="submit" disabled={busy}>
            {t('save')}
          </Btn>
        </div>
      </form>

      <section className="panel stack">
        <h3>{t('account')}</h3>
        {account.email && <p className="small muted">{account.email}</p>}
        <Btn icon="left" onClick={() => void signOut()}>
          {t('sign_out')}
        </Btn>
        <Btn kind="danger" icon="x" onClick={() => setDeleting(true)}>
          {t('st_delete')}
        </Btn>
      </section>

      <Sheet open={deleting} onClose={() => setDeleting(false)} title={t('st_delete_title')}>
        <p>{t('st_delete_body')}</p>
        <div className="actions">
          <Btn icon="left" onClick={() => setDeleting(false)}>
            {t('cancel')}
          </Btn>
          <Btn
            kind="danger"
            icon="x"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await backend.deleteAccount();
                window.location.assign('/');
              } catch (e) {
                setDeleting(false);
                setProblem(t('error', { code: errorCode(e) }));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('st_delete_ok')}
          </Btn>
        </div>
      </Sheet>
    </Page>
  );
}
