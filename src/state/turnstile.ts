/**
 * Cloudflare Turnstile, used once per phone: Supabase asks for a CAPTCHA token on the first
 * anonymous sign-in when "CAPTCHA protection" is on. Most people never see a challenge; when
 * Cloudflare does want one, it appears in a small card at the bottom of the screen.
 */
interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT;
    el.async = true;
    el.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile);
    el.onerror = () => {
      loading = null;
      reject(new Error('captcha_unavailable'));
    };
    document.head.appendChild(el);
  });
  return loading;
}

export async function captchaToken(siteKey: string): Promise<string> {
  const api = await load();
  const box = document.createElement('div');
  box.className = 'captcha-box';
  document.body.appendChild(box);
  return new Promise<string>((resolve, reject) => {
    let id = '';
    const done = () => {
      clearTimeout(timer);
      if (id) api.remove(id);
      box.remove();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('captcha_timeout'));
    }, 60_000);
    id = api.render(box, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      callback: (token: string) => {
        done();
        resolve(token);
      },
      'error-callback': () => {
        done();
        reject(new Error('captcha_failed'));
      },
    });
  });
}
