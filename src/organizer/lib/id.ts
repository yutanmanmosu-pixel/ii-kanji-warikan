/**
 * 一意なIDを作る。
 * 同姓同名の参加者を区別するため、名前ではなく必ずこのIDで識別する。
 * crypto.randomUUID が使えない古い環境向けにフォールバックを用意する。
 */
export function createId(prefix: string): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `${prefix}_${cryptoObj.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}
