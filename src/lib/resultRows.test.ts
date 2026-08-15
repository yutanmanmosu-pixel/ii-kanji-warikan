import { describe, expect, it } from 'vitest';
import { buildResultGroups } from './resultRows';
import { buildShareText } from './shareText';
import { calculateSplit } from './split';
import { DEFAULT_WEIGHTS, emptyCounts, emptyMemos } from '../constants/split';
import type { FixedMember, LevelCounts, LevelMemos, RoundingUnit } from '../types/split';

let seq = 0;
function fixed(amount: number, name = ''): FixedMember {
  seq += 1;
  return { id: `f${seq}`, name, amount };
}

function groupsFor(
  total: number,
  partialCounts: Partial<LevelCounts>,
  options: { unit?: RoundingUnit; fixed?: FixedMember[]; memos?: Partial<LevelMemos> } = {},
) {
  const result = calculateSplit({
    total,
    unit: options.unit ?? 100,
    counts: { ...emptyCounts(), ...partialCounts },
    weights: DEFAULT_WEIGHTS,
    fixed: options.fixed ?? [],
  });
  if (!result.ok) throw new Error('計算に失敗しました');
  const memos: LevelMemos = { ...emptyMemos(), ...options.memos };
  return { groups: buildResultGroups(result.shares, memos), result, memos };
}

describe('buildResultGroups', () => {
  it('同じ段階の人はひとつのグループにまとまる', () => {
    const { groups } = groupsFor(30000, { normal: 3 });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('ふつう');
    expect(groups[0].count).toBe(3);
    expect(groups[0].buckets).toEqual([{ amount: 10000, count: 3, roundingDiff: 0 }]);
  });

  it('段階ごとに分かれ、少なめ→多めの順に並ぶ', () => {
    const { groups } = groupsFor(50000, { more: 1, normal: 2, less: 1 });
    expect(groups.map((group) => group.label)).toEqual(['少なめ', 'ふつう', '多め']);
    expect(groups[1].count).toBe(2);
  });

  it('端数を引き受けた人がいると、同じ段階の中で金額が2つに分かれる', () => {
    const { groups } = groupsFor(10000, { normal: 3 });
    expect(groups).toHaveLength(1);
    expect(groups[0].buckets).toHaveLength(2);
    // 金額が大きいほうが先
    expect(groups[0].buckets[0].amount).toBeGreaterThan(groups[0].buckets[1].amount);
    expect(groups[0].buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
  });

  it('メモがグループに反映される', () => {
    const { groups } = groupsFor(30000, { normal: 3 }, { memos: { normal: '田中、佐藤、鈴木' } });
    expect(groups[0].memo).toBe('田中、佐藤、鈴木');
  });

  it('固定金額の人は個別のグループになり、最後に並ぶ', () => {
    const { groups } = groupsFor(30000, { normal: 2 }, { fixed: [fixed(10000, '部長')] });
    expect(groups.map((group) => group.label)).toEqual(['ふつう', '部長']);
    expect(groups[1].kind).toBe('fixed');
  });

  it('グループの人数と金額の合計が、会計金額と一致する', () => {
    const { groups, result } = groupsFor(42800, { less: 2, normal: 2, slightlyMore: 1, more: 1 });
    const sum = groups.reduce(
      (acc, group) => acc + group.buckets.reduce((inner, bucket) => inner + bucket.amount * bucket.count, 0),
      0,
    );
    expect(sum).toBe(42800);
    expect(groups.reduce((acc, group) => acc + group.count, 0)).toBe(result.headcount);
  });
});

describe('buildShareText', () => {
  it('人数でまとめた行は「ずつ」を付けて1人あたりの金額だと分かるようにする', () => {
    const { groups } = groupsFor(30000, { normal: 3 });
    const text = buildShareText(30000, groups, false);
    expect(text).toContain('ふつう 3人：10,000円ずつ');
    expect(text).toContain('合計：30,000円');
  });

  it('メモを入れると括弧で添えられる', () => {
    const { groups } = groupsFor(30000, { normal: 3 }, { memos: { normal: '田中、佐藤、鈴木' } });
    expect(buildShareText(30000, groups, false)).toContain('ふつう 3人：10,000円ずつ（田中、佐藤、鈴木）');
  });

  it('端数で金額が分かれた段階は、金額ごとの人数を書く', () => {
    const { groups } = groupsFor(10000, { normal: 3 });
    expect(buildShareText(10000, groups, false)).toContain('ふつう 3人：3,400円が1人、3,300円が2人');
  });

  it('固定金額の人は名前と金額だけを書く', () => {
    const { groups } = groupsFor(30000, { normal: 2 }, { fixed: [fixed(10000, '部長')] });
    expect(buildShareText(30000, groups, false)).toContain('部長：10,000円');
  });

  it('名前のない固定金額の人は「固定金額」と書く', () => {
    const { groups } = groupsFor(30000, { normal: 2 }, { fixed: [fixed(10000)] });
    expect(buildShareText(30000, groups, false)).toContain('固定金額：10,000円');
  });

  it('ひとことを添えると末尾に文章が入る', () => {
    const { groups } = groupsFor(30000, { normal: 3 });
    expect(buildShareText(30000, groups, true).endsWith('こちらの金額でよろしくお願いします！')).toBe(true);
    expect(buildShareText(30000, groups, false).endsWith('こちらの金額でよろしくお願いします！')).toBe(false);
  });
});
