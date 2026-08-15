import { APP_CATCHPHRASE, APP_LEAD, APP_NAME } from '../constants/app';

/**
 * 1画面に入力欄と計算ボタンまで収めたいので、ファーストビューは3行だけにしている。
 */
export function Hero() {
  return (
    <header className="hero">
      <h1 className="hero__title">{APP_NAME}</h1>
      <p className="hero__catch">{APP_CATCHPHRASE}</p>
      <p className="hero__lead">{APP_LEAD}</p>
    </header>
  );
}
