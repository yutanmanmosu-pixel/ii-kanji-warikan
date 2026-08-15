/**
 * クリップボードへコピーする。
 * navigator.clipboard は https 以外や一部の古い WebView で使えないため、
 * 失敗したら execCommand にフォールバックする。それも駄目なら false を返し、
 * UI 側で「長押しでコピーしてください」と本文を出す。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // フォールバックへ
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}

/** Web Share API が使えるかどうか（未対応ブラウザでは共有ボタン自体を出さない） */
export function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * OS の共有シートを開く。ユーザーがキャンセルしてもエラー表示しない。
 * ここで初めて入力内容が「ユーザーが選んだアプリ」に渡る（サーバー送信ではない）。
 */
export async function shareViaWebShare(text: string): Promise<boolean> {
  if (!canUseWebShare()) return false;
  try {
    await navigator.share({ text });
    return true;
  } catch {
    return false;
  }
}
