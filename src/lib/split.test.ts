import { describe, expect, it } from 'vitest';
import { calculateSplit } from './split';
import { DEFAULT_WEIGHTS, emptyCounts } from '../constants/split';
import type { FixedMember, LevelCounts, LevelId, RoundingUnit, SplitResult } from '../types/split';

function counts(partial: Partial<LevelCounts>): LevelCounts {
  return { ...emptyCounts(), ...partial };
}

let seq = 0;
function fixed(amount: number, name = ''): FixedMember {
  seq += 1;
  return { id: `f${seq}`, name, amount };
}

function run(
  total: number,
  levelCounts: Partial<LevelCounts>,
  options: { unit?: RoundingUnit; fixed?: FixedMember[]; weights?: Partial<Record<LevelId, number>> } = {},
): SplitResult {
  return calculateSplit({
    total,
    unit: options.unit ?? 100,
    counts: counts(levelCounts),
    weights: { ...DEFAULT_WEIGHTS, ...options.weights },
    fixed: options.fixed ?? [],
  });
}

function amounts(result: SplitResult): number[] {
  if (!result.ok) throw new Error('計算に失敗しました');
  return result.shares.map((share) => share.amount);
}

describe('calculateSplit', () => {
  it('1. 30,000円 / ふつう3人 → 10,000円ずつ・合計一致', () => {
    const result = run(30000, { normal: 3 });
    expect(amounts(result)).toEqual([10000, 10000, 10000]);
    if (result.ok) expect(result.sum).toBe(30000);
  });

  it('2. 5段階を1人ずつ → 少なめ<ちょい少なめ<ふつう<ちょい多め<多め・合計一致', () => {
    const result = run(50000, { less: 1, slightlyLess: 1, normal: 1, slightlyMore: 1, more: 1 });
    const values = amounts(result);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
    if (result.ok) expect(result.sum).toBe(50000);
  });

  it('2-2. 既定の割合は 0.5 / 0.8 / 1 / 1.2 / 1.5 倍になっている', () => {
    const result = run(100000, { less: 1, slightlyLess: 1, normal: 1, slightlyMore: 1, more: 1 }, { unit: 1 });
    const values = amounts(result);
    const base = values[2];
    expect(values[0] / base).toBeCloseTo(0.5, 2);
    expect(values[1] / base).toBeCloseTo(0.8, 2);
    expect(values[3] / base).toBeCloseTo(1.2, 2);
    expect(values[4] / base).toBeCloseTo(1.5, 2);
  });

  it('3. 固定金額10,000円 + ふつう2人 → 残り20,000円を等分', () => {
    const result = run(30000, { normal: 2 }, { fixed: [fixed(10000)] });
    expect(amounts(result)).toEqual([10000, 10000, 10000]);
    if (result.ok) expect(result.sum).toBe(30000);
  });

  it('3-2. 金額が空（0円）の固定行は計算に入らない', () => {
    const result = run(30000, { normal: 3 }, { fixed: [fixed(0, '未入力')] });
    expect(amounts(result)).toEqual([10000, 10000, 10000]);
    if (result.ok) expect(result.headcount).toBe(3);
  });

  it('4. 42,800円 / 100円単位 → 全員100円単位で合計一致', () => {
    const result = run(42800, { less: 2, normal: 2, slightlyMore: 1, more: 1 });
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.sum).toBe(42800);
    result.shares.forEach((share) => expect(share.amount % 100).toBe(0));
  });

  it('5. スライダーで割合を変えると金額が変わり、合計は一致したまま', () => {
    const base = run(30000, { less: 1, normal: 2 });
    const changed = run(30000, { less: 1, normal: 2 }, { weights: { less: 20 } });
    expect(amounts(changed)[0]).toBeLessThan(amounts(base)[0]);
    if (changed.ok) expect(changed.sum).toBe(30000);
  });

  it('5-2. 「ふつう」の割合は変更できない（常に基準の1倍）', () => {
    const result = run(30000, { normal: 3 }, { weights: { normal: 500 } });
    expect(amounts(result)).toEqual([10000, 10000, 10000]);
  });

  it('5-3. 割合が範囲外でも壊れず、範囲内に丸められる', () => {
    const result = run(30000, { less: 1, normal: 1 }, { weights: { less: 99999 } });
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.sum).toBe(30000);
    expect(amounts(result).every((value) => value >= 0)).toBe(true);
  });

  it('6. 固定金額の合計が会計額を超えるとエラーになる', () => {
    const result = run(10000, { normal: 2 }, { fixed: [fixed(8000), fixed(5000)] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('fixedOverTotal');
      expect(result.amount).toBe(3000);
    }
  });

  it('6-2. 固定金額だけで会計額とちょうど一致する場合は成立する', () => {
    const result = run(10000, {}, { fixed: [fixed(6000), fixed(4000)] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sum).toBe(10000);
  });

  it('6-3. 残額があるのに人数が0人ならエラーになる', () => {
    const result = run(10000, {}, { fixed: [fixed(4000)] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('noPayer');
      expect(result.amount).toBe(6000);
    }
  });

  it('7. 1人なら全額をその人が払う', () => {
    const result = run(4321, { normal: 1 });
    expect(amounts(result)).toEqual([4321]);
  });

  it('8. 丸めで割り切れない端数は1人がまとめて引き受ける', () => {
    const result = run(10050, { normal: 2 });
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.sum).toBe(10050);
    const withResidue = result.shares.filter((share) => share.roundingDiff > 0);
    expect(withResidue).toHaveLength(1);
    expect(withResidue[0].roundingDiff).toBe(50);
  });

  it('8-2. 端数は割合が大きい人に寄せる', () => {
    const result = run(10050, { less: 1, more: 1 });
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.shares[0].roundingDiff).toBe(0);
    expect(result.shares[1].roundingDiff).toBe(50);
  });

  it('8-3. 固定金額の人は端数調整の対象にしない', () => {
    const result = run(20050, { normal: 2 }, { fixed: [fixed(10000)] });
    if (!result.ok) throw new Error('計算に失敗しました');
    const fixedShare = result.shares.find((share) => share.kind === 'fixed');
    expect(fixedShare?.amount).toBe(10000);
    expect(fixedShare?.roundingDiff).toBe(0);
    expect(result.sum).toBe(20050);
  });

  it('9. 非常に小さい金額でも合計が一致する（丸め単位が大きい場合は警告）', () => {
    const result = run(1, { normal: 3 });
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.sum).toBe(1);
    expect(result.warnings).toContain('unitTooLarge');
  });

  it('9-2. 非常に大きい金額でも合計が一致する', () => {
    const result = run(99999999, { less: 1, normal: 1, more: 1 }, { unit: 1000 });
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.sum).toBe(99999999);
  });

  it('10. 人数が多くても合計が一致する', () => {
    const result = run(123456, { less: 6, slightlyLess: 6, normal: 6, slightlyMore: 6, more: 6 });
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.sum).toBe(123456);
    expect(result.headcount).toBe(30);
  });

  it('会計金額が0・未入力・異常値ならエラーコードを返す', () => {
    expect(run(0, { normal: 3 }).ok).toBe(false);
    expect(run(Number.NaN, { normal: 3 }).ok).toBe(false);
    expect(run(-1000, { normal: 3 }).ok).toBe(false);
  });

  it('人数も固定金額も0ならエラーコードを返す', () => {
    const result = run(10000, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('noParticipants');
  });

  it('負の固定金額は0円として扱い、計算から外す', () => {
    const result = run(10000, { normal: 1 }, { fixed: [fixed(-5000)] });
    expect(amounts(result)).toEqual([10000]);
  });

  it('同じ入力なら常に同じ結果になる', () => {
    expect(amounts(run(10000, { normal: 3 }))).toEqual(amounts(run(10000, { normal: 3 })));
  });

  // 網羅テストでは拾いきれない組み合わせを潰すための不変条件チェック
  it('不変条件: どんな組み合わせでも合計は会計金額と一致し、負の金額は出ない', () => {
    const units: RoundingUnit[] = [1, 10, 100, 500, 1000];
    let checked = 0;

    for (let seed = 1; seed <= 500; seed += 1) {
      const result = run(
        (seed * 977) % 200000,
        {
          less: seed % 4,
          slightlyLess: (seed + 1) % 3,
          normal: (seed + 2) % 5,
          slightlyMore: (seed + 3) % 3,
          more: (seed + 4) % 3,
        },
        {
          unit: units[seed % units.length],
          fixed: seed % 3 === 0 ? [fixed((seed * 13) % 5000)] : [],
          weights: { less: 10 + ((seed * 7) % 290), more: 10 + ((seed * 11) % 290) },
        },
      );
      if (!result.ok) continue;
      checked += 1;
      expect(result.sum).toBe(result.total);
      result.shares.forEach((share) => {
        expect(share.amount).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(share.amount)).toBe(true);
      });
    }

    expect(checked).toBeGreaterThan(200);
  });
});
