import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sideName, type MatchState } from '../core/session';
import { useT } from '../i18n';
import { backend, remember } from '../state';
import { errorCode, type SessionCtx } from '../state/useSession';
import { Btn, Center, Icon, Page, Sheet } from '../ui/kit';
import { ResultsList, StandingsTable } from '../ui/session-ui';
import { useRunner } from './Board';
import { HostGate } from './HostGate';
import { LiveView } from './LiveView';
import { Scorer } from './Scorer';
import { SummaryView } from './Summary';

export function HostScorer() {
  const { n = '1' } = useParams();
  return <HostGate tabs={false}>{(ctx) => <Scorer ctx={ctx} court={Number(n)} back={`/s/${ctx.sessionId}`} />}</HostGate>;
}

export function HostStandings() {
  const t = useT();
  return (
    <HostGate>
      {(ctx) => (
        <>
          <h1>{t('standings')}</h1>
          <StandingsTable s={ctx.state} />
        </>
      )}
    </HostGate>
  );
}

export function HostLive() {
  const t = useT();
  return (
    <HostGate>
      {(ctx) => (
        <>
          <p className="box small">
            <Icon name="info" size={14} /> {t('preview_note')}
          </p>
          <LiveView s={ctx.state} slug={ctx.state.slug} />
        </>
      )}
    </HostGate>
  );
}

export function HostSummary() {
  return <HostGate tabs={false}>{(ctx) => <HostSummaryBody ctx={ctx} />}</HostGate>;
}

function HostSummaryBody({ ctx }: { ctx: SessionCtx }) {
  const t = useT();
  const run = useRunner();
  const [editing, setEditing] = useState<MatchState | null>(null);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const s = ctx.state;
  if (s.status !== 'closed') {
    return (
      <>
        <h1>{t('summary')}</h1>
        <ResultsList
          s={s}
          onEdit={(m) => {
            setEditing(m);
            setA(m.result!.gamesA);
            setB(m.result!.gamesB);
          }}
        />
        <Link className="btn ghost" to={`/s/${ctx.sessionId}`}>
          <Icon name="left" />
          <span>{t('back_courts')}</span>
        </Link>
        <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('edit_title')}>
          {editing && (
            <div className="edit-score">
              <label>
                <span>{sideName(s, editing.a)}</span>
                <input type="number" min={0} max={20} value={a} onChange={(e) => setA(Number(e.target.value))} />
              </label>
              <label>
                <span>{sideName(s, editing.b)}</span>
                <input type="number" min={0} max={20} value={b} onChange={(e) => setB(Number(e.target.value))} />
              </label>
            </div>
          )}
          <div className="actions">
            <Btn icon="left" onClick={() => setEditing(null)}>
              {t('cancel')}
            </Btn>
            <Btn
              kind="primary"
              icon="check"
              disabled={a === b}
              onClick={() =>
                run(async () => {
                  const m = editing!;
                  setEditing(null);
                  await ctx.append({ type: 'edit_result', payload: { matchId: m.id, gamesA: a, gamesB: b } });
                })
              }
            >
              {t('save')}
            </Btn>
          </div>
        </Sheet>
      </>
    );
  }
  return <SummaryView s={s} device={ctx.device} />;
}

/** /h/:id#key: adds host rights to this phone, then opens the courts board. */
export function HostLink() {
  const { id = '' } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const key = window.location.hash.slice(1);
    backend
      .claimHost(id, key)
      .then(() => {
        remember({ id, slug: '', name: '', role: 'host', hostKey: key, at: new Date().toISOString() });
        nav(`/s/${id}`, { replace: true });
      })
      .catch((e) => setError(errorCode(e)));
  }, [id, nav]);
  return (
    <Page>
      <Center>{error ? <p className="box warn">{t(error === 'bad_host_key' ? 'bad_key' : 'error', { code: error })}</p> : <p>{t('restoring')}</p>}</Center>
      {error && (
        <Link className="btn ghost" to="/">
          <Icon name="left" />
          <span>{t('back_home')}</span>
        </Link>
      )}
    </Page>
  );
}
