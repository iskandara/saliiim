import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { backend, readHistory } from '../state';
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

  return (
    <Page header="full">
      <section className="court-surface hero">
        <p className="eyebrow">{t('home_eyebrow')}</p>
        <h1>{t('tagline')}</h1>
        <p>{t('home_sub')}</p>
        <Btn kind="primary" icon="plus" onClick={() => nav('/new')}>
          {t('start_session')}
        </Btn>
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
        <h3>{t('past_sessions')}</h3>
        {history.length === 0 ? (
          <p className="box muted">{t('no_sessions')}</p>
        ) : (
          <ul className="list">
            {history.map((h) => (
              <li key={h.id}>
                <Link className="row link-row" to={h.role === 'host' ? `/s/${h.id}` : `/p/${h.slug}`}>
                  <span>
                    <b>{h.name}</b>
                    <span className="small muted">
                      {new Date(h.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {t(h.role === 'host' ? 'role_host' : 'role_player')}
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
    </Page>
  );
}
