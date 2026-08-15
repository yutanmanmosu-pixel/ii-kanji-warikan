import {
  BASE_LEVEL,
  BASE_WEIGHT,
  LEVEL_ORDER,
  ROUNDING_UNITS,
  WEIGHT_MAX,
  WEIGHT_MIN,
} from '../constants/split';
import type {
  FixedMember,
  LevelId,
  RoundingUnit,
  SplitInput,
  SplitResult,
  SplitShare,
  SplitWarningCode,
} from '../types/split';

interface Entry {
  level: LevelId;
  weight: number;
}

/**
 * 割り勘計算の中核。UI に一切依存しない純粋関数。
 *
 * 手順:
 *   1. 会計総額を整数に正規化する
 *   2. 固定金額の人を確定し、合計を会計総額から引く
 *   3. 残額を「丸め単位のかたまり」に分割し、各段階の割合に応じて配る
 *   4. 丸め単位で割り切れない端数は、いちばん割合の大きい人が引き受ける
 *   5. 最後に合計＝会計総額であることを必ず保証する
 *
 * 小数を使わないのは、0.8 などの割合で割ると誤差が出て
 * 「合計が1円合わない」という致命的な結果になりうるため。
 */
export function calculateSplit(input: SplitInput): SplitResult {
  const unit = normalizeUnit(input.unit);
  const total = normalizeAmount(input.total);

  // 金額が入っていない固定金額の行は、まだ設定途中とみなして無視する
  const fixedMembers: FixedMember[] = input.fixed
    .map((member) => ({ ...member, amount: normalizeAmount(member.amount) }))
    .filter((member) => member.amount > 0);

  const entries: Entry[] = [];
  for (const level of LEVEL_ORDER) {
    const count = normalizeCount(input.counts[level]);
    const weight = normalizeWeight(level, input.weights[level]);
    for (let index = 0; index < count; index += 1) {
      entries.push({ level, weight });
    }
  }

  const headcount = entries.length + fixedMembers.length;
  if (total <= 0) {
    return { ok: false, error: 'noTotal', amount: 0 };
  }
  if (headcount === 0) {
    return { ok: false, error: 'noParticipants', amount: 0 };
  }

  const fixedSum = fixedMembers.reduce((sum, member) => sum + member.amount, 0);
  if (fixedSum > total) {
    return { ok: false, error: 'fixedOverTotal', amount: fixedSum - total };
  }

  const rest = total - fixedSum;
  if (entries.length === 0 && rest > 0) {
    return { ok: false, error: 'noPayer', amount: rest };
  }

  const warnings: SplitWarningCode[] = [];
  const amounts = new Array<number>(entries.length).fill(0);
  const diffs = new Array<number>(entries.length).fill(0);

  if (entries.length > 0) {
    const weightSum = entries.reduce((sum, entry) => sum + entry.weight, 0);

    // 残額を「丸め単位のかたまり」に分けてから配ると、全員の金額が自動的に丸め単位になる
    const chipCount = Math.floor(rest / unit);
    const residue = rest - chipCount * unit;

    const chips = entries.map((entry) => Math.floor((chipCount * entry.weight) / weightSum));
    let leftover = chipCount - chips.reduce((sum, count) => sum + count, 0);

    // 最大剰余法。取りこぼしが大きい人 → 割合が大きい人 → 先に並んでいる人 の順に1かたまりずつ配る
    const order = entries
      .map((entry, index) => ({
        index,
        weight: entry.weight,
        remainder: chipCount * entry.weight - chips[index] * weightSum,
      }))
      .sort((a, b) => b.remainder - a.remainder || b.weight - a.weight || a.index - b.index);

    for (const item of order) {
      if (leftover <= 0) break;
      chips[item.index] += 1;
      leftover -= 1;
    }

    entries.forEach((_entry, index) => {
      amounts[index] = chips[index] * unit;
    });

    // 丸め単位で割り切れない端数（例: 100円単位で42,850円 → 50円）は
    // いちばん負担が重い人がまとめて引き受ける。全員に1円ずつ散らすより納得感がある。
    if (residue > 0) {
      const target = pickResidueTarget(entries, amounts);
      amounts[target] += residue;
      diffs[target] = residue;
    }

    if (chipCount === 0) {
      warnings.push('unitTooLarge');
    }
  }

  const shares: SplitShare[] = entries.map((entry, index) => ({
    kind: 'level',
    level: entry.level,
    amount: amounts[index],
    roundingDiff: diffs[index],
  }));

  for (const member of fixedMembers) {
    shares.push({
      kind: 'fixed',
      id: member.id,
      name: member.name.trim(),
      amount: member.amount,
      roundingDiff: 0,
    });
  }

  let sum = shares.reduce((acc, share) => acc + share.amount, 0);

  // 想定外の計算漏れがあっても「合計＝会計金額」だけは必ず守るための保険。
  // 通常はここに入らない（テストで確認している）。
  if (sum !== total) {
    const fallback = shares.find((share) => share.kind === 'level');
    if (fallback) {
      const diff = total - sum;
      fallback.amount += diff;
      fallback.roundingDiff += diff;
      sum = total;
    }
  }

  return { ok: true, total, sum, headcount, shares, warnings };
}

/** 端数を引き受ける人を選ぶ。割合が最大 → 金額が最大 → 先頭の順。 */
function pickResidueTarget(entries: Entry[], amounts: number[]): number {
  let best = 0;
  for (let index = 1; index < entries.length; index += 1) {
    const isHeavier = entries[index].weight > entries[best].weight;
    const isSameWeightButLarger =
      entries[index].weight === entries[best].weight && amounts[index] > amounts[best];
    if (isHeavier || isSameWeightButLarger) {
      best = index;
    }
  }
  return best;
}

/** 負の値・小数・NaN・Infinity が来ても壊れないように整数の0以上に丸める */
function normalizeAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** 「ふつう」は常に基準値。それ以外はスライダーの範囲に収める。 */
function normalizeWeight(level: LevelId, value: number): number {
  if (level === BASE_LEVEL) return BASE_WEIGHT;
  if (!Number.isFinite(value)) return BASE_WEIGHT;
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round(value)));
}

function normalizeUnit(unit: RoundingUnit): RoundingUnit {
  return ROUNDING_UNITS.includes(unit) ? unit : 1;
}
