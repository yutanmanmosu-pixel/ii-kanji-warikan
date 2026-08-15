/** 3桁区切り。内部は number、表示だけカンマを付ける。 */
function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('ja-JP');
}

/** 「10,000円」の形にする */
export function formatYen(value: number): string {
  return `${formatNumber(value)}円`;
}

/**
 * 内部の整数の重み（ふつう=100）を「0.5」「1.25」のような表示にする。
 * 末尾の0は落として読みやすくする。
 */
export function formatRatio(weight: number): string {
  const value = weight / 100;
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * 入力欄の値から数字だけを取り出す。
 * 日本語IMEで全角数字が入る／カンマや円を打ってしまう、といった入力を吸収する。
 * 戻り値は先頭の余分な0を落とした数字列（空文字＝未入力）。
 */
export function toDigits(raw: string, maxDigits: number): string {
  const halfWidth = raw.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  );
  const digitsOnly = halfWidth.replace(/[^0-9]/g, '');
  const trimmed = digitsOnly.replace(/^0+(?=\d)/, '');
  return trimmed.slice(0, maxDigits);
}

/** 数字列 → 金額。空文字は0。 */
export function digitsToAmount(digits: string): number {
  if (digits === '') return 0;
  const value = Number(digits);
  return Number.isFinite(value) ? value : 0;
}

/** 入力欄に表示する文字列（カンマ付き）。未入力のときは空にしてplaceholderを見せる。 */
export function digitsToDisplay(digits: string): string {
  if (digits === '') return '';
  return formatNumber(Number(digits));
}
