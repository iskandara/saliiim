import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { allMatchesFinished, sideName, type MatchState } from '../core/session';
import { useT } from '../i18n';
import { hostKeyFor } from '../state';
import { errorCode, type SessionCtx } from '../state/useSession';
import { absUrl, Btn, copyText, Icon, inAppBrowser, Sheet, useToast } from '../ui/kit';
import { CourtsList, LiveBadge, NextUp, Notices, ProgressLine } from '../ui/session-ui';
import { HostGate } from './HostGate';

export function Board() {
  return (
    <HostGate wide>
      {(ctx) => <BoardBody ctx={ctx} />}
    </HostGate>
  );
}

const dismissedKey = (id: string) => `saliiim:hostlink-dismissed:${id}`;

export function useRunner() {
  const t = useT();
  const toast = useToast();
  return async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast(t('error', { code: errorCode(e) }));
    }
  };
}

function BoardBody({ ctx }: { ctx: SessionCtx }) {
  const { state: s, append, sessionId, role } = ctx;
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const run = useRunner();
  const id = sessionId!;
  const [showLink, setShowLink] = useState(() => {
    try {
      return !localStorage.getItem(dismissedKey(id));
    } catch {
      return true;
    }
  });
  const [skipping, setSkipping] = useState<MatchState | null>(null);
  const [handing, setHanding] = useState(false);
  const [closing, setClosing] = useState(false);

  if (s.status === 'draft') return <Navigate to={`/s/${id}/players`} replace />;
  if (s.status === 'closed') return <Navigate to={`/s/${id}/summary`} replace />;

  const hostKey = hostKeyFor(id);
  const hostLink = hostKey ? absUrl(`/h/${id}#${hostKey}`) : null;
  const pending = s.players.filter((p) => p.status === 'pending');

  const hideLink = () => {
    setShowLink(false);
    try {
      localStorage.setItem(dismissedKey(id), '1');
    } catch {
      /* ignore */
    }
  };

  const skip = (m: MatchState) =>
    run(async () => {
      setSkipping(null);
      await append({ type: 'skip_match', payload: { matchId: m.id } });
      toast(t('skipped_toast'), { label: t('undo'), run: () => void run(() => append({ type: 'unskip_match', payload: { matchId: m.id } })) });
    });

  const askSkip = (m: MatchState) => setSkipping(m);

  return (
    <>
      <div className="head">
        <h2>{s.settings.name}</h2>
        <LiveBadge />
      </div>
      <ProgressLine s={s} />

      {showLink && hostLink && role === 'host' && (
        <div className="card hostlink">
          <div className="card-head">
            <b>{t('hostlink_title')}</b>
            <button className="icon-btn" aria-label={t('dismiss')} onClick={hideLink}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <p className="small">{t('hostlink_body')}</p>
          <div className="copy-row">
            <code>{hostLink.replace(/^https?:\/\//, '').slice(0, 28)}…</code>
            <Btn
              kind="primary"
              small
              icon="link"
              onClick={async () => {
                if (await copyText(hostLink)) toast(t('copied'));
                hideLink();
              }}
            >
              {t('copy_link')}
            </Btn>
          </div>
          <p className="small warn-text">
            <Icon name="info" size={14} /> {t('hostlink_warn')}
          </p>
          {inAppBrowser() && <p className="small warn-text">{t('inapp_warn')}</p>}
        </div>
      )}

      <Notices s={s} />

      {allMatchesFinished(s) && (
        <div className="card accent">
          <b>{t('all_done_title')}</b>
          <p className="small">{t('all_done_body')}</p>
          <Btn kind="dark" icon="lock" onClick={() => setClosing(true)}>
            {t('close_btn')}
          </Btn>
        </div>
      )}

      {pending.length > 0 && (
        <section>
          <h3>{t('join_requests')}</h3>
          <ul className="list">
            {pending.map((p) => (
              <li key={p.id} className="row">
                <span className="grow">{p.name}</span>
                <Btn small kind="primary" icon="check" onClick={() => run(() => append({ type: 'approve_join', payload: { id: p.id } }))}>
                  {t('approve')}
                </Btn>
                <Btn small icon="x" onClick={() => run(() => append({ type: 'decline_join', payload: { id: p.id } }))}>
                  {t('decline')}
                </Btn>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="board-layout">
        <div className="board-main">
          <CourtsList
            s={s}
            render={(court, m) =>
              m && (
                <div className="actions">
                  <Link className="btn primary" to={`/s/${id}/court/${court}`} viewTransition>
                    <Icon name={m.inputs.length ? 'play' : 'edit'} />
                    <span>{m.inputs.length ? t('resume_match') : t('start_match')}</span>
                  </Link>
                  <Btn icon="skip" onClick={() => askSkip(m)}>
                    {t('skip')}
                  </Btn>
                </div>
              )
            }
          />
        </div>

        <aside className="board-side">
          <NextUp
            s={s}
            render={(m) => (
              <button className="link-btn" onClick={() => askSkip(m)}>
                {t('skip')}
              </button>
            )}
          />

          <section>
            <h3>{t('share')}</h3>
            <div className="btn-row">
              <Btn
                icon="link"
                onClick={async () => {
                  if (await copyText(absUrl(`/p/${s.slug}`))) toast(t('copied'));
                }}
              >
                {t('copy_public')}
              </Btn>
              {hostLink && role === 'host' && !showLink && (
                <Btn icon="key" onClick={() => setShowLink(true)}>
                  {t('hostlink_btn')}
                </Btn>
              )}
            </div>
          </section>

          <section>
            <h3>{t('manage')}</h3>
            <div className="stack tight">
              <Link className="btn ghost" to={`/s/${id}/roster`} viewTransition>
                <Icon name="users" />
                <span>{t('roster_btn')}</span>
              </Link>
              <Link className="btn ghost" to={`/s/${id}/summary`} viewTransition>
                <Icon name="trophy" />
                <span>{t('all_results')}</span>
              </Link>
              {s.settings.scorerMode === 'host' && (
                <Btn icon="users" onClick={() => setHanding(true)}>
                  {t('hand_btn')}
                </Btn>
              )}
            </div>
          </section>

          <section className="end-session">
            <h3>{t('end_session')}</h3>
            <Btn kind="dark" icon="lock" onClick={() => setClosing(true)}>
              {t('close_btn')}
            </Btn>
          </section>
        </aside>
      </div>

      <Sheet open={!!skipping} onClose={() => setSkipping(null)} title={t('skip_title')}>
        {skipping && (
          <p>{t(skipping.inputs.length ? 'skip_body' : 'skip_body_unplayed', { a: sideName(s, skipping.a), b: sideName(s, skipping.b) })}</p>
        )}
        <div className="actions">
          <Btn icon="left" onClick={() => setSkipping(null)}>
            {t('cancel')}
          </Btn>
          <Btn kind="danger" icon="skip" onClick={() => skipping && skip(skipping)}>
            {t('skip')}
          </Btn>
        </div>
      </Sheet>

      <Sheet open={handing} onClose={() => setHanding(false)} title={t('hand_title')}>
        <p>{t('hand_body')}</p>
        <div className="actions">
          <Btn icon="left" onClick={() => setHanding(false)}>
            {t('cancel')}
          </Btn>
          <Btn
            kind="primary"
            icon="check"
            onClick={() =>
              run(async () => {
                setHanding(false);
                await append({ type: 'hand_scoring', payload: {} });
              })
            }
          >
            {t('hand_ok')}
          </Btn>
        </div>
      </Sheet>

      <Sheet open={closing} onClose={() => setClosing(false)} title={t('close_title')}>
        <p>{t('close_body')}</p>
        <div className="actions">
          <Btn icon="left" onClick={() => setClosing(false)}>
            {t('cancel')}
          </Btn>
          <Btn
            kind="dark"
            icon="lock"
            onClick={() =>
              run(async () => {
                setClosing(false);
                await append({ type: 'close', payload: { by: 'host' } });
                nav(`/s/${id}/summary`);
              })
            }
          >
            {t('close_btn')}
          </Btn>
        </div>
      </Sheet>
    </>
  );
}
