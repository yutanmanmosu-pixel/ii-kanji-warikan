import { useEffect, useRef } from 'react';

const ADMAX_ID = '44402923a5bbda4d92fa083e464ba783';

type AdMaxWindow = Window & {
  admaxads?: Array<{
    admax_id: string;
    type: string;
  }>;
};

export function AdMaxAd() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const adWindow = window as AdMaxWindow;

    adWindow.admaxads = adWindow.admaxads || [];
    adWindow.admaxads.push({
      admax_id: ADMAX_ID,
      type: 'banner',
    });

    // 読み込みスクリプトがまだなければ追加する
    if (!document.querySelector('script[data-admax-loader]')) {
      const script = document.createElement('script');
      script.src = 'https://adm.shinobi.jp/st/t.js';
      script.async = true;
      script.charset = 'utf-8';
      script.dataset.admaxLoader = 'true';

      document.body.appendChild(script);
    }
  }, []);

  return (
    <aside className="adSlot" aria-label="広告">
      <div
        className="admax-ads"
        data-admax-id={ADMAX_ID}
        style={{ display: 'inline-block' }}
      />
    </aside>
  );
}