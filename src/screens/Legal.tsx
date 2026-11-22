import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePrefs } from '../i18n';
import { PRIVACY, TERMS, type LegalDoc } from '../legal';
import { Icon, Page } from '../ui/kit';

/** "**bold** rest" → bold lead-in, plain rest. Only the one pattern the legal text uses. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
  );
}

function Body({ lines }: { lines: string[] }) {
  // Consecutive "- " lines form one list.
  const blocks: (string | string[])[] = [];
  for (const l of lines) {
    if (l.startsWith('- ')) {
      const last = blocks.at(-1);
      if (Array.isArray(last)) last.push(l.slice(2));
      else blocks.push([l.slice(2)]);
    } else blocks.push(l);
  }
  return (
    <>
      {blocks.map((b, i) =>
        Array.isArray(b) ? (
          <ul key={i} className="bullets">
            {b.map((x, j) => (
              <li key={j}>{inline(x)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b)}</p>
        ),
      )}
    </>
  );
}

function LegalPage({ docs }: { docs: Record<'en' | 'id', LegalDoc> }) {
  const { t, lang } = usePrefs();
  const d = docs[lang === 'jksl' ? 'id' : 'en'];
  return (
    <Page header="full">
      <article className="legal" lang={lang === 'jksl' ? 'id' : 'en'}>
        <h1>{d.title}</h1>
        <p className="small muted">{d.updated}</p>
        <p>{d.intro}</p>
        {d.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            <Body lines={s.body} />
          </section>
        ))}
      </article>
      <Link className="btn ghost" to="/">
        <Icon name="left" />
        <span>{t('back_home')}</span>
      </Link>
    </Page>
  );
}

export const PrivacyPage = () => <LegalPage docs={PRIVACY} />;
export const TermsPage = () => <LegalPage docs={TERMS} />;
