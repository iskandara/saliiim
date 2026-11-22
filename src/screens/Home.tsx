import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { backend, readHistory } from '../state';
import { useAccount } from '../state/account';
import type { MySession } from '../state/backend';
import { useInstall } from '../state/install';
import { Ball, Btn, Field, Icon, Page } from '../ui/kit';

/** Accepts a full link or a bare slug and returns the public slug, or null. */
function slugFrom(input: string): string | null {
  const text = input.trim();
  const fromUrl = text.match(/\/p\/([A-Za-z0-9_-]{6,})/);
  if (fromUrl) return fromUrl[1]!;
  return /^[A-Za-z0-9_-]{6,}$/.test(text) ? text : null;
}

export function Home() {
  const t = useT();
  const nav = useNavigate();
  const history = readHistory();
  const lastHosted = history.find((h) => h.role === 'host');
  const [link, setLink] = useState('');
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const installer = useInstall();
  const acct = useAccount();
  const [mine, setMine] = useState<MySession[] | null>(null);
  useEffect(() => {
    if (acct.account) backend.mySessions().then(setMine, () => setMine(null));
  }, [acct.account]);
  // Signed in: sessions from the account, on any phone. Guests: this phone's own list.
  const rows = mine
    ? mine.map((m) => ({ id: m.id, slug: m.slug, name: m.name, at: m.createdAt, host: m.role === 'host' || m.role === 'co_host' }))
    : history.map((h) => ({ id: h.id, slug: h.slug, name: h.name, at: h.at, host: h.role === 'host' }));

  return (
    <Page header="full">
      <section className="court-surface hero">
        <h1>{t('tagline')}</h1>
        <p>{t('home_sub')}</p>
        {acct.ready && !acct.account ? (
          <Btn kind="primary" icon="user" onClick={() => acct.signIn({ reason: 'host', next: '/new' })}>
            {t('host_gate_title')}
          </Btn>
        ) : (
          <Btn kind="primary" icon="plus" onClick={() => nav('/new')}>
            {t('start_session')}
          </Btn>
        )}
        <div className="ball-row" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <Ball key={i} size={26} />
          ))}
        </div>
      </section>

      {installer.mode && (
        <section className="panel install">
          <div className="install-head">
            <img src="/icon-192.png" alt="" width="48" height="48" />
            <div>
              <h3>{t('install_title')}</h3>
              <p className="small muted">{installer.mode === 'ios' ? t('install_ios') : t('install_body')}</p>
            </div>
          </div>
          <div className="btn-row">
            {installer.mode === 'prompt' && (
              <Btn
                kind="dark"
                icon="download"
                onClick={async () => {
                  if (await installer.install()) backend.track('app_installed');
                }}
              >
                {t('install_btn')}
              </Btn>
            )}
            <Btn onClick={installer.dismiss}>{t('not_now')}</Btn>
          </div>
        </section>
      )}

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const slug = slugFrom(link);
          if (!slug) return setLinkErr(t('bad_link'));
          backend.track('link_pasted');
          nav(`/p/${slug}`);
        }}
      >
        <Field label={t('have_link')} error={linkErr}>
          <div className="inline-form">
            <input
              value={link}
              inputMode="url"
              placeholder={t('have_link_ph')}
              onChange={(e) => {
                setLink(e.target.value);
                setLinkErr(null);
              }}
            />
            <Btn kind="dark" type="submit">
              {t('open_link')}
            </Btn>
          </div>
        </Field>
      </form>

      <section>
        <h3>{t(mine ? 'your_sessions' : 'past_sessions')}</h3>
        {rows.length === 0 ? (
          <p className="box muted">{t('no_sessions')}</p>
        ) : (
          <ul className="list">
            {rows.map((h) => (
              <li key={h.id}>
                <Link className="row link-row" to={h.host ? `/s/${h.id}` : `/p/${h.slug}`}>
                  <span>
                    <b>{h.name}</b>
                    <span className="small muted">
                      {new Date(h.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {t(h.host ? 'role_host' : 'role_player')}
                    </span>
                  </span>
                  <Icon name="right" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {lastHosted && (
        <Btn icon="undo" onClick={() => nav('/new?repeat=1')}>
          {t('repeat_last')}
        </Btn>
      )}
      <footer className="home-foot">
        <Link className="feedback-link" to="/feedback">
          <Icon name="edit" size={16} />
          <span>{t('fb_link')}</span>
        </Link>
        <nav className="legal-links" aria-label={t('legal')}>
          <Link to="/privacy">{t('privacy')}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms">{t('terms')}</Link>
        </nav>
      </footer>
    </Page>
  );
}
