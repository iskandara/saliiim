import { useId, useState } from 'react';
import { usePrefs } from '../i18n';
import { backend } from '../state';
import type { FeedbackInput } from '../state/backend';
import { errorCode } from '../state/useSession';
import { Ball, Btn, Field, Icon, Seg } from './kit';

const sentKey = (sessionId: string) => `saliiim:feedback-sent:${sessionId}`;

export function feedbackSent(sessionId: string | null): boolean {
  if (!sessionId) return false;
  try {
    return localStorage.getItem(sentKey(sessionId)) === '1';
  } catch {
    return false;
  }
}

/** Five tennis balls; tapping the third gives 3 out of 5. */
function Rating({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const { t } = usePrefs();
  return (
    <div className="rating" role="radiogroup" aria-label={t('fb_rating')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('fb_rate_n', { n })}
          className={value !== null && n <= value ? 'on' : ''}
          onClick={() => onChange(n)}
        >
          <Ball size={34} tone={value !== null && n <= value ? 'lime' : 'grass'} />
        </button>
      ))}
    </div>
  );
}

/**
 * Feedback form. On the summary it opens with just the rating; the rest appears after a tap.
 * On the feedback page everything shows at once.
 */
export function FeedbackForm({ source, sessionId, title }: { source: FeedbackInput['source']; sessionId: string | null; title?: string }) {
  const { t, lang } = usePrefs();
  const [rating, setRating] = useState<number | null>(null);
  const [kind, setKind] = useState<FeedbackInput['kind']>('other');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [open, setOpen] = useState(source === 'page');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(() => feedbackSent(sessionId));
  const errId = useId();

  if (sent) {
    return (
      <div className="card feedback done" role="status">
        <Ball size={28} />
        <p>{t('fb_thanks')}</p>
      </div>
    );
  }

  const send = async () => {
    if (rating === null && !message.trim()) {
      setProblem(t('fb_need'));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await backend.sendFeedback({ rating, kind, message: message.trim(), contact: contact.trim(), source, lang, sessionId });
      if (sessionId) {
        try {
          localStorage.setItem(sentKey(sessionId), '1');
        } catch {
          /* ignore */
        }
      }
      setSent(true);
    } catch (e) {
      const code = errorCode(e);
      setProblem(code === 'too_much_feedback' ? t('fb_too_many') : t('fb_error', { code }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="card feedback"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {title && <h3>{title}</h3>}
      <Rating
        value={rating}
        onChange={(n) => {
          setRating(n);
          setOpen(true);
          setProblem(null);
        }}
      />
      {!open && (
        <button type="button" className="link-btn" onClick={() => setOpen(true)}>
          {t('fb_write')}
        </button>
      )}
      {open && (
        <>
          <div className="field">
            <span className="field-label">{t('fb_type')}</span>
            <Seg
              label={t('fb_type')}
              value={kind}
              options={[
                ['bug', t('fb_bug')],
                ['idea', t('fb_idea')],
                ['other', t('fb_other')],
              ]}
              onChange={setKind}
            />
          </div>
          <Field label={t('fb_message')}>
            <textarea
              rows={4}
              maxLength={2000}
              value={message}
              placeholder={t('fb_message_ph')}
              aria-describedby={problem ? errId : undefined}
              onChange={(e) => {
                setMessage(e.target.value);
                setProblem(null);
              }}
            />
          </Field>
          <Field label={t('fb_contact')}>
            <input value={contact} maxLength={120} placeholder={t('fb_contact_ph')} autoComplete="email" onChange={(e) => setContact(e.target.value)} />
          </Field>
          {problem && (
            <p id={errId} className="field-error" role="alert">
              <Icon name="info" size={14} /> {problem}
            </p>
          )}
          <Btn kind="primary" icon="check" type="submit" disabled={busy}>
            {t('fb_send')}
          </Btn>
          <p className="small muted">{t('fb_privacy')}</p>
        </>
      )}
    </form>
  );
}
