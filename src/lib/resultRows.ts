import { LEVEL_LABELS, LEVEL_ORDER } from '../constants/split';
import type { LevelId, LevelMemos, SplitShare } from '../types/split';

/** 同じ金額の人のかたまり */
export interface AmountBucket {
  amount: number;
  count: number;
  /** 丸めの端数を引き受けた額（0なら表示しない） */
  roundingDiff: number;
}

export interface ResultGroup {
  key: string;
  kind: 'level' | 'fixed';
  /** 「少なめ」または固定金額の人の名前 */
  label: string;
  /** 段階につけたメモ（例:「田中、佐藤」）。固定金額の人には付かない。 */
  memo: string;
  count: number;
  /** 金額の大きい順。丸めの端数で1人だけ金額が違う場合に2つ以上になる。 */
  buckets: AmountBucket[];
}

/**
 * 人数で入力するアプリなので、結果も段階ごとにまとめて出す。
 * 丸めの端数を引き受けた人は金額が変わるため、同じ段階の中で buckets が分かれる。
 */
export function buildResultGroups(shares: SplitShare[], memos: LevelMemos): ResultGroup[] {
  const groups: ResultGroup[] = [];

  for (const level of LEVEL_ORDER) {
    const levelShares = shares.filter(
      (share): share is Extract<SplitShare, { kind: 'level' }> =>
        share.kind === 'level' && share.level === level,
    );
    if (levelShares.length === 0) continue;

    groups.push({
      key: `level:${level}`,
      kind: 'level',
      label: LEVEL_LABELS[level],
      memo: (memos[level] ?? '').trim(),
      count: levelShares.length,
      buckets: toBuckets(levelShares.map((share) => ({ amount: share.amount, diff: share.roundingDiff }))),
    });
  }

  for (const share of shares) {
    if (share.kind !== 'fixed') continue;
    groups.push({
      key: `fixed:${share.id}`,
      kind: 'fixed',
      label: share.name,
      memo: '',
      count: 1,
      buckets: [{ amount: share.amount, count: 1, roundingDiff: 0 }],
    });
  }

  return groups;
}

function toBuckets(items: { amount: number; diff: number }[]): AmountBucket[] {
  const map = new Map<number, AmountBucket>();
  for (const item of items) {
    const bucket = map.get(item.amount);
    if (bucket) {
      bucket.count += 1;
      bucket.roundingDiff = Math.max(bucket.roundingDiff, item.diff);
    } else {
      map.set(item.amount, { amount: item.amount, count: 1, roundingDiff: item.diff });
    }
  }
  // 金額が大きいほうを先に出す（端数を引き受けた人が上に来て気づきやすい）
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** 段階ごとの合計人数（入力チェック用） */
export function countHeads(counts: Record<LevelId, number>): number {
  return LEVEL_ORDER.reduce((sum, level) => sum + Math.max(0, counts[level] ?? 0), 0);
}
