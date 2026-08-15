import { APP_NAME } from '../constants/app';
import { UI } from '../constants/messages';

export function Footer() {
  return (
    <footer className="footer">
      <p className="footer__privacy">{UI.footer.privacy}</p>
      <p className="footer__note">{UI.footer.note}</p>
      {/*
        SEO ページ（/how-to, /faq, /privacy など）を追加したら、
        ここにリンクを並べる。V1 ではページが無いためリンクは置かない。
      */}
      <p className="footer__brand">{APP_NAME}</p>
    </footer>
  );
}
