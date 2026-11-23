import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { backend } from '../state';
import { useAccount, type SignInReason } from '../state/account';
import { levelOf, type LevelChange } from '../state/backend';
import { DEMO_CODE } from '../state/localBackend';
import { errorCode } from '../state/useSession';
import { Btn, Field, Icon, Sheet, useToast } from './kit';

const REASON: Record<SignInReason, 'si_reason_host' | 'si_reason_save' | 'si_reason_claim' | 'si_reason_generic'> = {
  host: 'si_reason_host',
  save: 'si_reason_save',
  claim: 'si_reason_claim',
  generic: 'si_reason_generic',
};

function messageFor(t: ReturnType<typeof useT>, code: string) {
  switch (code) {
    case 'bad_code':
      return t('si_err_bad_code');
    case 'code_expired':
      return t('si_err_code_expired');
    case 'bad_email':
      return t('si_err_bad_email');
    case 'email_rate_limited':
      return t('si_err_rate');
    case 'google_not_enabled':
      return t('si_err_google');
    default:
      return t('si_err_generic', { code });
  }
}

/** Google's "G", as its sign-in button guidelines ask. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** The one sign-in sheet: Google, or email with a code (and a link in the same email). */
export function SignInSheet() {
  const t = useT();
  const toast = useToast();
  const { request, closeSignIn } = useAccount();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const open = !!request;

  useEffect(() => {
    if (open) {
      setSentTo(null);
      setCode('');
      setProblem(null);
    }
  }, [open]);
  useEffect(() => {
    if (sentTo) codeRef.current?.focus();
  }, [sentTo]);

  const next = request?.next;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(messageFor(t, errorCode(e)));
    } finally {
      setBusy(false);
    }
  };

  const send = (again = false) =>
    run(async () => {
      const e = email.trim();
      await backend.sendEmailCode(e, request?.sessionId, next);
      setSentTo(e);
      if (again) toast(t('si_sent'));
    });

  const verify = () =>
    run(async () => {
      await backend.verifyEmailCode(sentTo!, code);
      // A full load picks up the new identity everywhere and finishes moving this session's player.
      if (next) window.location.assign(next);
      else window.location.reload();
    });

  return (
    <Sheet open={open} onClose={closeSignIn} title={t('si_title')}>
      {request && <p>{t(REASON[request.reason])}</p>}
      {!sentTo ? (
        <>
          <button type="button" className="btn ghost google-btn" onClick={() => run(() => backend.signInWithGoogle(request?.sessionId, next))} disabled={busy}>
            <GoogleMark />
            <span>{t('si_google')}</span>
          </button>
          <p className="or-rule" aria-hidden="true">
            <span>{t('si_or')}</span>
          </p>
          <form
            className="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return setProblem(t('si_err_bad_email'));
              void send();
            }}
          >
            <Field label={t('si_email')}>
              <input type="email" inputMode="email" autoComplete="email" value={email} placeholder={t('si_email_ph')} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Btn kind="primary" icon="right" type="submit" disabled={busy}>
              {t('si_send')}
            </Btn>
          </form>
        </>
      ) : (
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="small">{t('si_code_help', { email: sentTo })}</p>
          <Field label={t('si_code')}>
            <input
              ref={codeRef}
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Btn kind="primary" icon="check" type="submit" disabled={busy || code.length < 6}>
            {t('si_verify')}
          </Btn>
          <div className="btn-row">
            <button type="button" className="link-btn" onClick={() => void send(true)} disabled={busy}>
              {t('si_resend')}
            </button>
            <button type="button" className="link-btn" onClick={() => setSentTo(null)}>
              {t('si_change_email')}
            </button>
          </div>
        </form>
      )}
      {problem && (
        <p className="field-error" role="alert">
          <Icon name="info" size={14} /> {problem}
        </p>
      )}
      {backend.mode === 'local' && <p className="small muted">{t('si_demo', { code: DEMO_CODE })}</p>}
      <p className="small muted">{t('si_guests')}</p>
      <p className="small muted">
        {t('si_agree', { terms: '\u0001', privacy: '\u0002' })
          .split(/([\u0001\u0002])/)
          .map((part, i) =>
            part === '\u0001' ? (
              <Link key={i} to="/terms" onClick={closeSignIn}>
                {t('terms')}
              </Link>
            ) : part === '\u0002' ? (
              <Link key={i} to="/privacy" onClick={closeSignIn}>
                {t('privacy')}
              </Link>
            ) : (
              part
            ),
          )}
      </p>
    </Sheet>
  );
}

export function Avatar({ name, url, size = 34 }: { name: string; url: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return url ? (
    <img className="avatar" src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar initials" style={{ width: size, height: size }} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

/** Header button: "Sign in" for guests, the avatar and an account sheet for accounts. */
export function AccountButton() {
  const t = useT();
  const { ready, account, profile, signIn, signOut } = useAccount();
  const [open, setOpen] = useState(false);
  if (!ready) return <span className="account-btn placeholder" aria-hidden="true" />;
  if (!account) {
    return (
      <button className="account-btn" onClick={() => signIn({ reason: 'generic' })} aria-label={t('sign_in')} title={t('sign_in')}>
        <Icon name="user" size={18} />
      </button>
    );
  }
  const name = profile?.name ?? account.name;
  return (
    <>
      <button className="account-btn" onClick={() => setOpen(true)} aria-label={`${t('account')}: ${name}`} title={name}>
        <Avatar name={name} url={profile?.photoUrl ?? account.avatarUrl} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('account')}>
        <div className="account-card">
          <Avatar name={name} url={profile?.photoUrl ?? account.avatarUrl} size={52} />
          <div>
            <b>{name}</b>
            {account.email && <p className="small muted">{account.email}</p>}
            {profile && <p className="small">{t('level_n', { n: levelOf(profile.rating).toFixed(1) })}</p>}
          </div>
        </div>
        <div className="actions column">
          <Link className="btn primary" to={`/u/${account.id}`} onClick={() => setOpen(false)}>
            <Icon name="user" />
            <span>{t('pf_mine')}</span>
          </Link>
          <Link className="btn ghost" to="/settings" onClick={() => setOpen(false)}>
            <Icon name="gear" />
            <span>{t('st_title')}</span>
          </Link>
          <Btn icon="left" onClick={() => void signOut()}>
            {t('sign_out')}
          </Btn>
        </div>
      </Sheet>
    </>
  );
}

const CLAIM_DAYS = 7;

/**
 * For a player in a session: guests are offered sign-in to keep the results (during the session,
 * or up to 7 days after it closed); signed-in players see that the results are theirs.
 */
export function ClaimCard({ sessionId, closedAt }: { sessionId: string | null; closedAt?: string | null }) {
  const t = useT();
  const { ready, account, signIn } = useAccount();
  if (!ready || !sessionId) return null;
  if (account) {
    return (
      <p className="small muted linked-note">
        <Icon name="check" size={14} /> {t('linked_note')}
      </p>
    );
  }
  const closed = closedAt !== undefined;
  if (closed && closedAt && Date.now() - Date.parse(closedAt) > CLAIM_DAYS * 864e5) return null;
  return (
    <div className="card claim-card">
      <b>{t(closed ? 'claim_title' : 'save_stats_title')}</b>
      <p className="small">{t(closed ? 'claim_body' : 'save_stats_body')}</p>
      <Btn kind="primary" icon="user" onClick={() => signIn({ reason: closed ? 'claim' : 'save', sessionId })}>
        {t('save_stats_btn')}
      </Btn>
    </div>
  );
}

/**
 * Summary card: each signed-in player's level before and after the session. Rating happens on the
 * server right after the close, so this asks for it and checks back a few times.
 */
export function LevelChanges({ sessionId, nameOf }: { sessionId: string | null; nameOf: (playerId: string) => string }) {
  const t = useT();
  const [rows, setRows] = useState<LevelChange[] | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    let tries = 0;
    const look = async () => {
      const r = await backend.levelChanges(sessionId).catch(() => []);
      if (!alive) return;
      if (r.length || tries >= 5) return setRows(r);
      if (tries === 0) backend.requestProcessing(sessionId);
      tries++;
      setTimeout(() => void look(), 2500);
    };
    void look();
    return () => {
      alive = false;
    };
  }, [sessionId]);
  if (!rows?.length) return null;
  return (
    <section>
      <h3>{t('lc_title')}</h3>
      <ul className="list">
        {rows.map((r) => {
          const before = levelOf(r.before);
          const after = levelOf(r.after);
          const up = after >= before;
          return (
            <li key={r.userId} className="row">
              <span className="grow">
                <Link to={`/u/${r.userId}`}>{nameOf(r.playerId)}</Link>
              </span>
              <span className="small muted">{before.toFixed(2)} →</span>
              <b>{after.toFixed(2)}</b>
              <span className={`delta ${up ? 'up' : 'down'}`}>{(up ? '+' : '') + (after - before).toFixed(2)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
