import { APP_NAME } from '../constants/app';
import { UI } from '../constants/messages';

interface Props {
  /** 今いるページ。現在地はリンクにせず文字だけにする。 */
  current?: 'top' | 'organizer';
}

const LINKS: { href: string; label: string; page?: 'top' | 'organizer' }[] = [
  { href: '/', label: 'サクッと割り勘', page: 'top' },
  { href: '/organizer/', label: '幹事モード', page: 'organizer' },
  { href: '/how-to/', label: '使い方' },
  { href: '/faq/', label: 'よくある質問' },
  { href: '/privacy/', label: 'プライバシーポリシー' },
  { href: '/terms/', label: '利用規約' },
];

export function Footer({ current = 'top' }: Props) {
  return (
    <footer className="footer">
      <p className="footer__privacy">{UI.footer.privacy}</p>
      <p className="footer__note">{UI.footer.note}</p>

      <nav className="footer__nav" aria-label="サイト内のページ">
        <ul className="footer__links">
          {LINKS.map((link) => (
            <li key={link.href}>
              {link.page === current ? (
                <span aria-current="page">{link.label}</span>
              ) : (
                <a href={link.href}>{link.label}</a>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <p className="footer__brand">{APP_NAME}</p>
    </footer>
  );
}
