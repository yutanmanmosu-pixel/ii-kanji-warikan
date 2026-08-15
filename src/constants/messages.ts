import type { SplitErrorCode, SplitWarningCode } from '../types/split';
import { MAX_FIXED_ROWS, MAX_HEADCOUNT } from './split';

/**
 * 画面に出る日本語をここに集約する。
 * コンポーネント側に文言が散らばると、トーンの調整や将来の多言語化が難しくなるため。
 */
export const UI = {
  amount: {
    heading: 'お会計はいくら？',
    label: 'お会計金額（円）',
    placeholder: '0',
    suffix: '円',
  },
  counters: {
    heading: '何人で割る？',
    totalCount: (count: number) => `合計 ${count}人`,
    decrease: (label: string) => `${label}を1人減らす`,
    increase: (label: string) => `${label}を1人増やす`,
    unit: '人',
    limit: `参加者は最大${MAX_HEADCOUNT}人までです`,
    openSettings: (label: string) => `${label}の割合とメモを開く`,
    closeSettings: (label: string) => `${label}の割合とメモを閉じる`,
    fixedNote: (count: number) => `このほかに固定金額の人が${count}人います`,
  },
  levelSettings: {
    ratioLabel: '割合',
    ratioValue: (text: string) => `${text}倍`,
    ratioHint: '「ふつう」を1倍としたときの割合です。',
    baseHint: '「ふつう」は基準なので1倍で固定です。ほかの段階の割合を動かして調整します。',
    reset: (text: string) => `初期値（${text}倍）に戻す`,
    memoLabel: 'メモ（任意）',
    memoPlaceholder: '田中、佐藤',
    memoHint: 'コピーする文章に添えられます。計算には影響しません。',
  },
  rounding: {
    heading: '金額の単位',
    groupLabel: '支払い金額の丸め単位',
    option: (unit: number) => `${unit.toLocaleString('ja-JP')}円`,
  },
  fixed: {
    open: '固定金額の人を設定する',
    close: '固定金額の設定を閉じる',
    lead: '「この人は3,000円」と決めたいときに使います。先に差し引いて、残りを人数で分けます。',
    nameLabel: (index: number) => `固定金額${index + 1}人目の名前`,
    namePlaceholder: '名前（任意）',
    amountLabel: (index: number) => `固定金額${index + 1}人目の金額（円）`,
    amountPlaceholder: '0',
    remove: '削除',
    removeLabel: (index: number) => `固定金額${index + 1}人目を削除する`,
    add: '＋ 固定金額の人を追加',
    limit: `固定金額の人は最大${MAX_FIXED_ROWS}人までです`,
    ignored: '金額が空の行は計算に入りません。',
  },
  cta: {
    calculate: 'いい感じに割り勘する',
    needAmount: 'お会計金額を入れると計算できます',
  },
  result: {
    heading: '結果',
    waiting: '金額と人数を入れて「いい感じに割り勘する」を押してください。',
    totalLabel: 'お会計',
    sumLabel: '合計',
    matched: '合計ぴったりです',
    count: (count: number) => `${count}人`,
    each: 'ずつ',
    perPeople: (count: number) => `× ${count}人`,
    fixedLabel: '固定金額',
    fixedTag: '固定',
    roundingTag: (amount: number) => `端数 +${amount.toLocaleString('ja-JP')}円`,
    copy: '結果をコピー',
    copied: 'コピーしました',
    copyFailed: 'コピーできませんでした。下の文章を長押しでコピーしてください。',
    share: '共有',
    edit: '条件を修正',
    reset: '最初からやり直す',
    resetConfirm: '入力した内容をすべて消して、最初からやり直しますか？',
    copyTextLabel: 'コピー用の文章',
    closingToggle: 'ひとことを添える',
    closing: 'こちらの金額でよろしくお願いします！',
  },
  errors: {
    noTotal: 'お会計金額を入れてください。',
    noParticipants: '人数を1人以上にしてください。',
    fixedOverTotal: (amount: number) =>
      `固定金額の合計が、お会計金額を${amount.toLocaleString('ja-JP')}円超えています。`,
    noPayer: (amount: number) =>
      `残り${amount.toLocaleString('ja-JP')}円を払う人がいません。人数を1人以上にしてください。`,
  },
  warnings: {
    unitTooLarge: '金額の単位が大きすぎて、うまく分けられませんでした。単位を小さくしてください。',
  },
  footer: {
    privacy: '入力内容はこの端末の中だけで計算しています。サーバーには送信されません。',
    note: '共有ボタンを使ったときだけ、選んだアプリに本文が渡されます。',
  },
} as const;

export function errorMessage(code: SplitErrorCode, amount: number): string {
  switch (code) {
    case 'noTotal':
      return UI.errors.noTotal;
    case 'noParticipants':
      return UI.errors.noParticipants;
    case 'fixedOverTotal':
      return UI.errors.fixedOverTotal(amount);
    case 'noPayer':
      return UI.errors.noPayer(amount);
  }
}

export function warningMessage(code: SplitWarningCode): string {
  switch (code) {
    case 'unitTooLarge':
      return UI.warnings.unitTooLarge;
  }
}
