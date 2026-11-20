import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { FeedbackForm } from '../ui/feedback';
import { Icon, Page } from '../ui/kit';

/** /feedback: the full form, reached from Home. */
export function FeedbackPage() {
  const t = useT();
  return (
    <Page header="full">
      <h1>{t('fb_page_title')}</h1>
      <p className="muted">{t('fb_page_sub')}</p>
      <FeedbackForm source="page" sessionId={null} />
      <Link className="btn ghost" to="/">
        <Icon name="left" />
        <span>{t('back_home')}</span>
      </Link>
    </Page>
  );
}
