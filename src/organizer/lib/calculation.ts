import { DEFAULT_WEIGHTS, LEVEL_ORDER, emptyCounts } from '../../constants/split';
import { calculateSplit } from '../../lib/split';
import type { SplitErrorCode, SplitWarningCode } from '../../types/split';
import type { OrganizerEvent, OrganizerParticipant, ParticipantFilter } from '../types';

/**
 * 幹事モードとトップページの計算をつなぐアダプター。
 *
 * 計算そのものは既存の calculateSplit() をそのまま使う。
 * ここがやるのは以下の変換だけ:
 *   参加者一覧 → 負担レベルごとの人数 → calculateSplit → 参加者ごとの徴収額
 *
 * 丸め処理・差額調整・合計一致の保証はすべて既存ロジック側の責務。
 */

/**
 * 幹事モード固有のエラー。
 * トップページの割り勘には存在しない状態なので、SplitErrorCode は変更せず
 * こちら側だけで扱う。
 */
export type OrganizerErrorCode = SplitErrorCode | 'fixedAmountMissing';

export type OrganizerCalculation =
  | {
      ok: true;
      total: number;
      /** 徴収額の合計。必ず total と一致する。 */
      sum: number;
      /** 参加者ID → 徴収額。欠席者は含まない。 */
      amounts: Record<string, number>;
      /** 参加者ID → 丸めの端数を引き受けた額（0なら表示しない） */
      roundingDiffs: Record<string, number>;
      attendingCount: number;
      warnings: SplitWarningCode[];
    }
  | {
      ok: false;
      error: OrganizerErrorCode;
      amount: number;
      /** fixedAmountMissing のときに、金額が未入力の人の表示名 */
      names?: string[];
    };

/** 出席している人だけを返す。名簿の並び順は保つ。 */
export function attendingParticipants(participants: OrganizerParticipant[]): OrganizerParticipant[] {
  return participants.filter((participant) => participant.attendance === 'attending');
}

/**
 * 固定額で徴収する人。
 *
 * 金額が未入力（null）でも「固定額の人」として扱う。
 * ユーザーが画面で「徴収方法：固定額」を選んでいるのに、金額が空だからといって
 * 勝手に5段階へ回すと、表示と計算結果の意味が食い違うため。
 * 未入力のままなら計算そのものを止める（needsFixedAmount を参照）。
 */
export function isFixedCharge(participant: OrganizerParticipant): boolean {
  return participant.chargeMode === 'fixed';
}

/** 固定額を選んでいるのに金額が入っていない人。出席者だけが対象。 */
export function needsFixedAmount(participant: OrganizerParticipant): boolean {
  return (
    participant.attendance === 'attending' &&
    participant.chargeMode === 'fixed' &&
    participant.fixedAmount === null
  );
}

/**
 * 金額が未入力の固定額参加者を返す。
 * 欠席者は計算対象外なので含めない。
 */
export function participantsMissingFixedAmount(
  participants: OrganizerParticipant[],
): OrganizerParticipant[] {
  return participants.filter(needsFixedAmount);
}

/** 5段階で分け合う人（出席者のうち固定額でない人） */
function weightedParticipants(participants: OrganizerParticipant[]): OrganizerParticipant[] {
  return attendingParticipants(participants).filter((participant) => !isFixedCharge(participant));
}

/**
 * 参加者一覧を、負担レベルごとの人数に集約する。
 * 固定額の人は重みの計算に入れない。
 */
export function toLevelCounts(participants: OrganizerParticipant[]) {
  const counts = emptyCounts();
  for (const participant of weightedParticipants(participants)) {
    counts[participant.level] += 1;
  }
  return counts;
}

export function calculateOrganizerSplit(event: OrganizerEvent): OrganizerCalculation {
  const attending = attendingParticipants(event.participants);

  // 固定額を選んだのに金額が空の人がいる間は、飲み会全体を未完了として扱う。
  // 中途半端な金額を出すより、入力を促すほうが安全。
  const missing = participantsMissingFixedAmount(event.participants);
  if (missing.length > 0) {
    return {
      ok: false,
      error: 'fixedAmountMissing',
      amount: 0,
      names: missing.map((participant) => participant.name.trim()),
    };
  }

  const weighted = weightedParticipants(event.participants);
  const fixedMembers = attending.filter(isFixedCharge);

  const result = calculateSplit({
    total: event.totalAmount,
    unit: event.roundingUnit,
    counts: toLevelCounts(event.participants),
    weights: event.weights ?? DEFAULT_WEIGHTS,
    // 固定額はここで既存エンジンに渡す。差し引き・超過判定・丸めの対象外扱いは
    // すべて calculateSplit() 側の仕様をそのまま使う。
    fixed: fixedMembers.map((participant) => ({
      id: participant.id,
      name: participant.name,
      amount: participant.fixedAmount ?? 0,
    })),
  });

  if (!result.ok) {
    // 固定額0円の人しかいない場合、エンジンは金額0の固定額を無視するため
    // 「参加者0人」と判定する。実際には人はいて、残額を配る人がいない状態。
    if (result.error === 'noParticipants' && attending.length > 0) {
      return { ok: false, error: 'noPayer', amount: event.totalAmount };
    }
    return { ok: false, error: result.error, amount: result.amount };
  }

  const amounts: Record<string, number> = {};
  const roundingDiffs: Record<string, number> = {};

  // 固定額の人は id をそのまま返してもらえるので直接対応づけられる
  for (const share of result.shares) {
    if (share.kind === 'fixed') {
      amounts[share.id] = share.amount;
      roundingDiffs[share.id] = share.roundingDiff;
    }
  }

  // 金額0の固定額の人はエンジン側で除外されるので、ここで0円として補う
  for (const participant of fixedMembers) {
    if (amounts[participant.id] === undefined) {
      amounts[participant.id] = 0;
      roundingDiffs[participant.id] = 0;
    }
  }

  // calculateSplit は LEVEL_ORDER の順に1人ずつ share を並べて返す。
  // 同じレベルの中の並びも入力順のままなので、レベルごとに先頭から突き合わせれば
  // 「誰がいくら」を取り違えずに復元できる。
  for (const level of LEVEL_ORDER) {
    const levelShares = result.shares.filter(
      (share) => share.kind === 'level' && share.level === level,
    );
    const levelMembers = weighted.filter((participant) => participant.level === level);

    levelMembers.forEach((participant, index) => {
      const share = levelShares[index];
      if (!share) return;
      amounts[participant.id] = share.amount;
      roundingDiffs[participant.id] = share.roundingDiff;
    });
  }

  return {
    ok: true,
    total: result.total,
    sum: result.sum,
    amounts,
    roundingDiffs,
    attendingCount: attending.length,
    warnings: result.warnings,
  };
}

/* ------------------------------------------------------------------ *
 * 集金状況
 *
 * 徴収額は保存せず毎回計算し直すため、会計金額・負担レベル・固定額を変えると
 * 「徴収予定額」は変わる。しかし実際に受け取った金額は変わらない。
 * そこで participant.collectedAmount に受け取った額を記録し、
 * 現在の徴収予定額との差を出せるようにしている。
 * ------------------------------------------------------------------ */

export type CollectionStatus =
  /** まだ受け取っていない */
  | 'unpaid'
  /** 受け取り済みで、徴収予定額とぴったり一致 */
  | 'settled'
  /** 受け取ったが、いまの徴収予定額に足りない */
  | 'short'
  /** 受け取りすぎている（欠席に変えた人を含む） */
  | 'over'
  /** 回収済みだが、いくら受け取ったかの記録がない（古い保存データ） */
  | 'unknown'
  /** 欠席していて集金の対象外 */
  | 'none';

export interface ParticipantCollection {
  /** いまの徴収予定額（欠席者は0） */
  due: number;
  /** 実際に受け取った額（記録がなければ0） */
  paid: number;
  status: CollectionStatus;
  /** 不足額（status が short のとき正の値） */
  shortage: number;
  /** 過剰額（status が over のとき正の値） */
  excess: number;
}

/** 1人分の集金状況を求める。徴収方法が5段階でも固定額でも同じ扱い。 */
export function collectionOf(
  participant: OrganizerParticipant,
  dueAmount: number,
): ParticipantCollection {
  const attending = participant.attendance === 'attending';
  const due = attending ? Math.max(0, dueAmount) : 0;

  if (!participant.collected) {
    return {
      due,
      paid: 0,
      status: attending ? 'unpaid' : 'none',
      shortage: attending ? due : 0,
      excess: 0,
    };
  }

  if (participant.collectedAmount === null) {
    // 金額が分からないので、集めきれているかを判断できない
    return { due, paid: 0, status: 'unknown', shortage: due, excess: 0 };
  }

  const paid = participant.collectedAmount;
  if (paid === due) {
    return { due, paid, status: 'settled', shortage: 0, excess: 0 };
  }
  if (paid < due) {
    return { due, paid, status: 'short', shortage: due - paid, excess: 0 };
  }
  return { due, paid, status: 'over', shortage: 0, excess: paid - due };
}

export interface OrganizerSummary {
  /** 名簿に載っている人数（欠席者を含む） */
  totalCount: number;
  attendingCount: number;
  absentCount: number;

  /*
   * 人数は collected フラグではなく CollectionStatus で数える。
   * 「回収済みにチェックした」だけでは、会計を変えたあとに
   *  差額が出ている人まで完了扱いになってしまうため。
   * 以下5つは出席者だけを対象にし、合計が attendingCount と必ず一致する。
   */
  /** 精算完了（受け取った額が徴収予定額とぴったり） */
  settledCount: number;
  /** 未回収（まだ受け取っていない） */
  unpaidCount: number;
  /** 差額あり・追加回収が必要 */
  shortCount: number;
  /** 差額あり・返金等の調整が必要 */
  overCount: number;
  /** 要確認（回収済みだが金額の記録がない） */
  unknownCount: number;
  /** 要対応＝精算完了以外の出席者（unpaid + short + over + unknown） */
  actionNeededCount: number;

  /** 欠席なのに回収記録が残っている人数（返金などの確認が必要） */
  absentCollectedCount: number;

  /** 出席者のうち固定額の人数 */
  fixedCount: number;
  /** 出席している固定額の人の合計金額 */
  fixedTotal: number;
  /** 出席者のうち5段階で分け合う人数 */
  weightedCount: number;

  /** 徴収予定総額（＝会計金額と一致する） */
  expectedAmount: number;
  /** 実際に受け取った金額の合計 */
  collectedAmount: number;
  /** これから集める必要がある金額 */
  remainingAmount: number;
  /** 多く受け取っている金額 */
  overpaidAmount: number;

  /** 出席者が1人以上いて、過不足なく集め終わっているか */
  isComplete: boolean;
}

/** 集金状況の集計。徴収額は保存せず、そのつど計算結果から求める。 */
export function summarize(
  participants: OrganizerParticipant[],
  amounts: Record<string, number>,
): OrganizerSummary {
  let attendingCount = 0;
  let settledCount = 0;
  let unpaidCount = 0;
  let shortCount = 0;
  let overCount = 0;
  let unknownCount = 0;
  let absentCollectedCount = 0;
  let fixedCount = 0;
  let fixedTotal = 0;
  let weightedCount = 0;
  let expectedAmount = 0;
  let collectedAmount = 0;
  let remainingAmount = 0;
  let overpaidAmount = 0;

  for (const participant of participants) {
    const collection = collectionOf(participant, amounts[participant.id] ?? 0);

    if (participant.attendance === 'attending') {
      attendingCount += 1;
      expectedAmount += collection.due;

      if (isFixedCharge(participant)) {
        fixedCount += 1;
        fixedTotal += participant.fixedAmount ?? 0;
      } else {
        weightedCount += 1;
      }

      switch (collection.status) {
        case 'settled':
          settledCount += 1;
          break;
        case 'short':
          shortCount += 1;
          break;
        case 'over':
          overCount += 1;
          break;
        case 'unknown':
          unknownCount += 1;
          break;
        default:
          unpaidCount += 1;
          break;
      }
    } else if (participant.collected && (collection.paid > 0 || participant.collectedAmount === null)) {
      // 回収したあとで欠席にした人。返金などの確認がいるので別枠で数える。
      absentCollectedCount += 1;
    }

    // 金額は欠席者の分も含める。受け取ってしまったお金は実在するため。
    collectedAmount += collection.paid;
    remainingAmount += collection.shortage;
    overpaidAmount += collection.excess;
  }

  const actionNeededCount = unpaidCount + shortCount + overCount + unknownCount;

  return {
    totalCount: participants.length,
    attendingCount,
    absentCount: participants.length - attendingCount,
    settledCount,
    unpaidCount,
    shortCount,
    overCount,
    unknownCount,
    actionNeededCount,
    absentCollectedCount,
    fixedCount,
    fixedTotal,
    weightedCount,
    expectedAmount,
    collectedAmount,
    remainingAmount,
    overpaidAmount,
    isComplete:
      attendingCount > 0 &&
      actionNeededCount === 0 &&
      absentCollectedCount === 0 &&
      remainingAmount === 0 &&
      overpaidAmount === 0,
  };
}

/**
 * 名前検索用に文字をそろえる。
 * NFKC で全角英数字を半角に寄せ、小文字化し、空白を無視する。
 * ひらがな⇔カタカナの変換や読みの推測まではしない（過剰実装を避ける）。
 */
function normalizeForSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\s\u3000]+/g, '');
}

/**
 * 名前の部分一致。検索対象は名前だけで、メモは含めない。
 * 表示上の絞り込みにしか使わず、計算・集計には一切影響させない。
 */
export function matchesParticipantSearch(name: string, query: string): boolean {
  const needle = normalizeForSearch(query);
  if (needle === '') return true;
  return normalizeForSearch(name).includes(needle);
}

/**
 * 名簿の絞り込みと、サマリーの人数を必ず同じ基準にするための判定。
 * ここを1か所にまとめておかないと、また意味がずれる。
 */
export function matchesParticipantFilter(
  status: CollectionStatus,
  filter: ParticipantFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'absent':
      return status === 'none';
    case 'settled':
      return status === 'settled';
    case 'action':
      // 精算完了・欠席以外はすべて要対応
      return status !== 'settled' && status !== 'none';
  }
}
