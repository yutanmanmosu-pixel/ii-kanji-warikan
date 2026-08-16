import { LEVEL_LABELS } from '../constants/split';
import type { ParticipantFilter } from './types';

/** 幹事モードの日本語をここに集約する（トップページの constants/messages.ts と同じ方針） */
export const ORGANIZER = {
  title: '幹事モード',
  lead: '名簿を用意しておけば、当日は会計金額を入れるだけ。集金状況まで管理できます。',
  backToTop: '← 名前を入れずに今すぐ計算（サクッと割り勘）',
  privacy: '名簿データはこの端末のブラウザ内に保存され、運営者のサーバーには送信されません。',
  storageUnavailable:
    'このブラウザでは保存機能が使えないため、ページを閉じると内容が消えます。プライベートモードを解除すると保存できます。',

  list: {
    heading: '飲み会を選ぶ',
    createHeading: '新しい飲み会を作る',
    namePlaceholder: '例）2026年 営業部暑気払い',
    nameLabel: '飲み会名',
    create: 'この名前で作る',
    savedHeading: '保存済みの飲み会',
    empty: 'まだ保存された飲み会はありません。上から作成してください。',
    open: '開く',
    rename: '名前を変更',
    duplicate: '複製',
    remove: '削除',
    removeConfirm: (name: string) => `「${name}」を削除します。元に戻せません。よろしいですか？`,
    renamePrompt: '新しい飲み会名を入力してください',
    duplicateSuffix: 'のコピー',
    participants: (count: number) => `${count}人`,
    updatedAt: (text: string) => `最終更新 ${text}`,
    untitled: '名前のない飲み会',
  },

  editor: {
    back: '← 飲み会の一覧',
    nameLabel: '飲み会名',
    amountHeading: '当日の会計金額',
    amountLabel: '会計金額（円）',
    roundingHeading: '金額の単位',
    advanced: '負担レベルの割合を調整する',
    advancedClose: '割合の調整を閉じる',
    advancedHint: '「ふつう」を1倍としたときの割合です。変更するとすぐに再計算されます。',
    weightReset: '初期値に戻す',
  },

  summary: {
    heading: '集金状況',
    participants: (attending: number, total: number) =>
      total === attending ? `参加 ${attending}人` : `参加 ${attending}人 / 名簿 ${total}人`,
    settledCount: (settled: number, attending: number) => `精算完了 ${settled} / ${attending}人`,
    actionNeeded: (count: number) => `要対応 ${count}人`,
    expected: '徴収予定',
    collected: '回収済み',
    unpaid: '残り',
    complete: '✓ 過不足なく集め終わりました',
    overpaid: (amount: number) => `⚠️ ${amount.toLocaleString('ja-JP')}円 多く回収しています`,
    diffCount: (count: number) => `⚠️ 徴収額と受け取った額が違う人が ${count}人 います`,
    absentCollected: (count: number) =>
      `⚠️ 欠席なのに回収記録が残っている人が ${count}人 います。返金の確認をしてください。`,
    unknownCount: (count: number) =>
      `⚠️ 回収した金額の記録がない人が ${count}人 います。名簿で金額を確定してください。`,
    needAmount: '会計金額を入れると徴収額を計算します。',
    needParticipants: '参加者を追加すると計算できます。',
    fixedOverTotal: (amount: number) =>
      `固定額の合計が会計金額を${amount.toLocaleString('ja-JP')}円超えています。固定額または会計金額を確認してください。`,
    noPayer: (amount: number) =>
      `残り${amount.toLocaleString('ja-JP')}円を割り振る5段階の参加者がいません。誰かを5段階にするか、固定額を見直してください。`,
    // 何人いても1行に収まるよう、2人以上は先頭の1人だけ名前を出す
    fixedAmountMissing: (names: string[]) => {
      const first = names[0] === '' || names[0] === undefined ? '名前未入力の参加者' : names[0];
      return names.length === 1
        ? `「${first}」の固定額が未入力です。金額を入力してください。`
        : `固定額が未入力の参加者が${names.length}人います（${first} ほか）。金額を入力してください。`;
    },
  },

  roster: {
    heading: '名簿',
    addPlaceholder: '名前を入力して追加',
    addLabel: '参加者の名前',
    add: '追加',
    addHint: 'Enterキーでも追加できます。',
    empty: 'まだ参加者がいません。名前を入れて追加するか、Excelから読み込んでください。',
    emptyFiltered: '条件に当てはまる人はいません。',
    searchLabel: '名前で検索',
    searchPlaceholder: '🔍 名前を検索',
    searchClear: '検索をやめる',
    searchCount: (shown: number, total: number) => `${shown} / ${total}人を表示`,
    nameLabel: (index: number) => `${index + 1}人目の名前`,
    levelLabel: '負担レベル',
    chargeLabel: '徴収方法',
    chargeWeighted: '5段階',
    chargeFixed: '固定額',
    fixedLabel: '固定額',
    fixedPlaceholder: '0',
    fixedUnit: '円',
    fixedEmpty: '固定額を入力してください',
    dueHeading: '徴収予定',
    attendanceLabel: '出欠',
    attending: '参加',
    absent: '欠席',
    absentAmount: '欠席（0円）',
    collected: '回収済み',
    collectedAt: (text: string) => `${text} に回収`,
    dueLabel: '徴収予定',
    paidLabel: '回収済み',
    shortage: (amount: number) => `⚠️ あと ${amount.toLocaleString('ja-JP')}円`,
    excess: (amount: number) => `⚠️ ${amount.toLocaleString('ja-JP')}円 多く回収しています`,
    unknownAmount: '⚠️ 回収した金額の記録がありません',
    settleShort: (amount: number) => `差額 ${amount.toLocaleString('ja-JP')}円 も回収した`,
    settleExcess: (amount: number) => `${amount.toLocaleString('ja-JP')}円 返して調整した`,
    settleUnknown: (amount: number) => `${amount.toLocaleString('ja-JP')}円 を回収済みとして確定`,
    needAmount: '会計金額を入れると回収チェックができます',
    memoLabel: 'メモ',
    memoPlaceholder: 'メモ（任意）',
    memoToggle: 'メモ',
    moveUp: '上へ移動',
    moveDown: '下へ移動',
    remove: '削除',
    removeConfirm: (name: string) => `「${name}」を名簿から削除します。よろしいですか？`,
    unnamed: '名前未入力',
    roundingTag: (amount: number) => `端数 +${amount.toLocaleString('ja-JP')}円`,
    waiting: '—',
  },

  filter: {
    label: '名簿の絞り込み',
    all: '全員',
    // サマリーの「要対応 / 精算完了」と同じ基準にそろえている
    action: '要対応',
    settled: '精算完了',
    absent: '欠席',
  },

  toolbar: {
    heading: 'まとめて操作',
    copyCollection: '集金案内をコピー',
    copyUnpaid: '未回収者をコピー',
    share: '共有',
    resetCollected: '全員を未回収に戻す',
    resetConfirm: '全員の回収済みチェックと、回収した金額の記録を消します。よろしいですか？',
    copied: 'コピーしました',
    copyFailed: 'コピーできませんでした。',
    reset: 'リセットしました',
  },

  excel: {
    cardHeading: '大人数ならExcelで一括登録できます',
    cardLead:
      '参加者が多い飲み会では、Excelテンプレートに名前・負担レベル・固定額などを入力して、まとめて名簿を登録できます。',
    cardNote: '少人数なら、このまま下から1人ずつ追加できます。',
    // 「ダウン / ロード」のような途中改行を防ぐため、意味のまとまりで分けておく
    templateParts: ['名簿テンプレートを', 'ダウンロード'],
    importParts: ['Excelから名簿を', '読み込む'],
    exportParts: ['集金表を', 'Excelで出力'],
    /** 取り込みパネルのグループ名（画面には出ない） */
    import: 'Excelから名簿を読み込む',
    importLabel: '名簿のExcelファイル',
    exportDisabled: '会計金額を入れると出力できます。',
    templateFileName: 'いい感じに割り勘_名簿テンプレート.xlsx',
    collectionFileName: (base: string) => `${base}_集金表.xlsx`,
    importReady: (count: number) => `${count}人を読み込みます。`,
    importSheet: (name: string) => `「${name}」シートを読み取りました。`,
    importReplace: '今の名簿を置き換える',
    importAppend: '今の名簿に追加する',
    importCancel: 'やめる',
    importErrors: (count: number) => `${count}行にエラーがあります。修正してから読み込んでください。`,
    importNone: '読み込める行がありませんでした。',
    importDone: (count: number) => `${count}人を読み込みました。`,
    reading: '読み込み中…',
  },

  levels: LEVEL_LABELS,
} as const;

export const FILTER_OPTIONS: { value: ParticipantFilter; label: string }[] = [
  { value: 'all', label: ORGANIZER.filter.all },
  { value: 'action', label: ORGANIZER.filter.action },
  { value: 'settled', label: ORGANIZER.filter.settled },
  { value: 'absent', label: ORGANIZER.filter.absent },
];
