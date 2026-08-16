import { APP_NAME } from '../constants/app';
import { Footer } from '../components/Footer';
import { ORGANIZER } from './constants';
import { EventEditor } from './components/EventEditor';
import { EventList } from './components/EventList';
import { useOrganizerEvents } from './hooks/useOrganizerEvents';

/**
 * 幹事モード。
 *
 * 参加者の実名を端末内で扱うため、このページには広告を入れない
 * （AdMaxAd を import しないこと）。
 * ルーターは使わず、一覧と編集を1ページ内の state で切り替える。
 * イベントIDをURLに出さないので、個人情報がURLに載ることもない。
 */
export default function OrganizerApp() {
  const state = useOrganizerEvents();

  return (
    <div className="page page--organizer">
      <header className="orgHeader">
        <p className="orgHeader__brand">{APP_NAME}</p>
        <h1 className="orgHeader__title">{ORGANIZER.title}</h1>
        <p className="orgHeader__lead">{ORGANIZER.lead}</p>
        <a className="orgHeader__back" href="/">
          {ORGANIZER.backToTop}
        </a>
      </header>

      <main className="main">
        {!state.storageOk && (
          <p className="notice notice--warn orgNotice" role="alert">
            {ORGANIZER.storageUnavailable}
          </p>
        )}

        {state.current ? (
          <EventEditor event={state.current} state={state} />
        ) : (
          <EventList state={state} />
        )}

        <p className="orgPrivacy">{ORGANIZER.privacy}</p>
      </main>

      <Footer current="organizer" />
    </div>
  );
}
