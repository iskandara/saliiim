import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { readHistory } from '../state';
import { Btn, Icon, Page } from '../ui/kit';

export function Home() {
  const t = useT();
  const nav = useNavigate();
  const history = readHistory();
  const lastHosted = history.find((h) => h.role === 'host');
  return (
    <Page>
      <h1>{t('home_title')}</h1>
      <p className="muted">{t('home_sub')}</p>
      <Btn kind="primary" icon="plus" onClick={() => nav('/new')}>
        {t('start_session')}
      </Btn>
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
        <Btn kind="dark" icon="undo" onClick={() => nav('/new?repeat=1')}>
          {t('repeat_last')}
        </Btn>
      )}
    </Page>
  );
}
