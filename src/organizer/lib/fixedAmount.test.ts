import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '../../constants/split';
import { calculateOrganizerSplit, collectionOf, summarize, toLevelCounts } from './calculation';
import { createEvent, createParticipant, duplicateEvent, parseStore, serializeStore } from './storage';
import type { LevelId } from '../../types/split';
import type { OrganizerEvent, OrganizerParticipant } from '../types';

/**
 * 固定額と5段階を混ぜたときの検証。
 * 計算そのものは既存の calculateSplit() に任せているので、
 * ここでは「アダプターが正しく橋渡しできているか」と
 * 「合計が必ず会計金額と一致するか」を確認する。
 */

interface Spec {
  name: string;
  fixed?: number;
  level?: LevelId;
  absent?: boolean;
}

function buildEvent(specs: Spec[], total: number, unit: 1 | 10 | 100 | 500 | 1000 = 100): OrganizerEvent {
  const event = createEvent('テスト飲み会');
  event.weights = { ...DEFAULT_WEIGHTS };
  event.roundingUnit = unit;
  event.totalAmount = total;
  event.participants = specs.map((spec) => {
    const participant = createParticipant(spec.name, spec.level ?? 'normal');
    if (spec.fixed !== undefined) {
      participant.chargeMode = 'fixed';
      participant.fixedAmount = spec.fixed;
    }
    if (spec.absent) participant.attendance = 'absent';
    return participant;
  });
  return event;
}

function amountsOf(event: OrganizerEvent): Record<string, number> {
  const result = calculateOrganizerSplit(event);
  if (!result.ok) throw new Error('計算に失敗しました');
  return result.amounts;
}

function totalOf(participants: OrganizerParticipant[], amounts: Record<string, number>): number {
  return participants.reduce((sum, participant) => sum + (amounts[participant.id] ?? 0), 0);
}

describe('固定額と5段階の混在', () => {
  it('Case 1: 固定10,000＋固定3,000＋5段階3人 → 残り37,000円を配分し合計50,000円', () => {
    const event = buildEvent(
      [
        { name: '田中部長', fixed: 10000 },
        { name: '新人', fixed: 3000 },
        { name: '山田', level: 'more' },
        { name: '佐藤', level: 'normal' },
        { name: '鈴木', level: 'less' },
      ],
      50000,
    );

    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');

    expect(result.amounts[event.participants[0].id]).toBe(10000);
    expect(result.amounts[event.participants[1].id]).toBe(3000);

    const weightedTotal =
      result.amounts[event.participants[2].id] +
      result.amounts[event.participants[3].id] +
      result.amounts[event.participants[4].id];
    expect(weightedTotal).toBe(37000);
    expect(result.sum).toBe(50000);
    expect(totalOf(event.participants, result.amounts)).toBe(50000);

    // 5段階の中では負担レベルの順に金額が並ぶ
    expect(result.amounts[event.participants[2].id]).toBeGreaterThan(
      result.amounts[event.participants[3].id],
    );
    expect(result.amounts[event.participants[3].id]).toBeGreaterThan(
      result.amounts[event.participants[4].id],
    );
  });

  it('Case 1-2: 固定額は丸め単位で書き換えられない', () => {
    // 会計30,050円・固定6,550円・残額23,500円（100円単位）
    const event = buildEvent(
      [
        { name: '部長', fixed: 6550 },
        { name: 'A', level: 'normal' },
        { name: 'B', level: 'normal' },
      ],
      30050,
    );

    const amounts = amountsOf(event);
    expect(amounts[event.participants[0].id]).toBe(6550);
    expect(amounts[event.participants[1].id] + amounts[event.participants[2].id]).toBe(23500);
    expect(totalOf(event.participants, amounts)).toBe(30050);
  });

  it('Case 1-3: どの丸め単位でも合計が会計金額と一致する', () => {
    for (const unit of [1, 10, 100, 500, 1000] as const) {
      const event = buildEvent(
        [
          { name: '部長', fixed: 12345 },
          { name: '新人', fixed: 0 },
          { name: 'A', level: 'more' },
          { name: 'B', level: 'normal' },
          { name: 'C', level: 'slightlyLess' },
        ],
        48765,
        unit,
      );
      const amounts = amountsOf(event);
      expect(totalOf(event.participants, amounts)).toBe(48765);
      expect(amounts[event.participants[0].id]).toBe(12345);
    }
  });

  it('Case 2: 固定額の合計が会計金額を超えるとエラーになる', () => {
    const event = buildEvent(
      [
        { name: '田中', fixed: 10000 },
        { name: '山田', fixed: 8000 },
        { name: '佐藤', fixed: 5000 },
      ],
      20000,
    );

    const result = calculateOrganizerSplit(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('fixedOverTotal');
      expect(result.amount).toBe(3000);
    }
  });

  it('Case 3: 全員固定で合計が会計金額とちょうど一致すれば成立する', () => {
    const event = buildEvent(
      [
        { name: '田中', fixed: 10000 },
        { name: '山田', fixed: 6000 },
        { name: '佐藤', fixed: 4000 },
      ],
      20000,
    );

    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.sum).toBe(20000);
    expect(totalOf(event.participants, result.amounts)).toBe(20000);
  });

  it('Case 4: 全員固定で残額があると、配る人がいないのでエラーになる', () => {
    const event = buildEvent(
      [
        { name: '田中', fixed: 10000 },
        { name: '山田', fixed: 6000 },
      ],
      20000,
    );

    const result = calculateOrganizerSplit(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('noPayer');
      expect(result.amount).toBe(4000);
    }
  });

  it('Case 5: 固定額0円が有効な値として扱われる', () => {
    const event = buildEvent(
      [
        { name: '主賓', fixed: 0 },
        { name: 'A', level: 'normal' },
        { name: 'B', level: 'normal' },
      ],
      20000,
    );

    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.amounts[event.participants[0].id]).toBe(0);
    expect(result.amounts[event.participants[1].id]).toBe(10000);
    expect(result.attendingCount).toBe(3);
    expect(totalOf(event.participants, result.amounts)).toBe(20000);

    const summary = summarize(event.participants, result.amounts);
    expect(summary.attendingCount).toBe(3);
    expect(summary.fixedCount).toBe(1);
    expect(summary.weightedCount).toBe(2);
  });

  it('Case 5-2: 全員が固定額0円なら、残額を配る人がいないエラーになる', () => {
    const event = buildEvent([{ name: 'A', fixed: 0 }, { name: 'B', fixed: 0 }], 10000);
    const result = calculateOrganizerSplit(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('noPayer');
      expect(result.amount).toBe(10000);
    }
  });

  /*
   * 仕様変更: 以前は「固定額が未入力なら5段階として計算する」だったが、
   * 画面で「徴収方法：固定額」を選んでいるのに5段階由来の金額が出るのは
   * 表示と計算の意味が食い違うため、計算そのものを止める方式に変えた。
   */
  it('Case 5-3: 固定額が未入力（null）なら計算を止め、5段階へフォールバックしない', () => {
    const event = buildEvent([{ name: 'A' }, { name: 'B' }], 20000);
    event.participants[0].chargeMode = 'fixed';
    event.participants[0].fixedAmount = null;

    const result = calculateOrganizerSplit(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('fixedAmountMissing');
      expect(result.names).toEqual(['A']);
    }

    // 5段階側の人数にも入らない（Bだけが5段階）
    expect(toLevelCounts(event.participants).normal).toBe(1);
  });

  it('Case 6: 固定額の人が欠席なら固定額合計から除外される', () => {
    const event = buildEvent(
      [
        { name: '田中', fixed: 10000, absent: true },
        { name: 'A', level: 'normal' },
        { name: 'B', level: 'normal' },
      ],
      20000,
    );

    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.attendingCount).toBe(2);
    expect(result.amounts[event.participants[0].id]).toBeUndefined();
    expect(result.amounts[event.participants[1].id]).toBe(10000);
    expect(totalOf(event.participants, result.amounts)).toBe(20000);

    // 参加に戻すと再び固定額として計算される
    const restored: OrganizerEvent = {
      ...event,
      participants: event.participants.map((participant, index) =>
        index === 0 ? { ...participant, attendance: 'attending' as const } : participant,
      ),
    };
    const again = calculateOrganizerSplit(restored);
    if (!again.ok) throw new Error('計算に失敗しました');
    expect(again.amounts[restored.participants[0].id]).toBe(10000);
    expect(again.amounts[restored.participants[1].id]).toBe(5000);
    expect(totalOf(restored.participants, again.amounts)).toBe(20000);
  });

  it('Case 23: 固定額の人は5段階の重み計算に入らない', () => {
    const event = buildEvent(
      [
        { name: '部長', fixed: 10000, level: 'more' },
        { name: 'A', level: 'normal' },
        { name: 'B', level: 'normal' },
      ],
      30000,
    );
    // 部長は level が 'more' でも、固定額なので人数集約に含めない
    expect(toLevelCounts(event.participants)).toEqual({
      less: 0,
      slightlyLess: 0,
      normal: 2,
      slightlyMore: 0,
      more: 0,
    });
  });
});

describe('固定額と集金状況（collectedAmount）', () => {
  function collect(event: OrganizerEvent, index: number): number {
    const amounts = amountsOf(event);
    const participant = event.participants[index];
    const due = amounts[participant.id] ?? 0;
    participant.collected = true;
    participant.collectedAt = new Date().toISOString();
    participant.collectedAmount = due;
    return due;
  }

  it('Case 7: 6,000円回収後に固定額を6,500円へ上げると不足500円になる', () => {
    const event = buildEvent([{ name: '田中', fixed: 6000 }, { name: 'A', level: 'normal' }], 20000);
    expect(collect(event, 0)).toBe(6000);

    event.participants[0].fixedAmount = 6500;
    const amounts = amountsOf(event);
    const state = collectionOf(event.participants[0], amounts[event.participants[0].id]);

    expect(state.status).toBe('short');
    expect(state.due).toBe(6500);
    expect(state.paid).toBe(6000);
    expect(state.shortage).toBe(500);

    const summary = summarize(event.participants, amounts);
    expect(summary.collectedAmount).toBe(6000);
    expect(summary.settledCount).toBe(0);
    expect(summary.shortCount).toBe(1);
  });

  it('Case 8: 固定額を5,500円へ下げると500円の過剰回収になる', () => {
    const event = buildEvent([{ name: '田中', fixed: 6000 }, { name: 'A', level: 'normal' }], 20000);
    collect(event, 0);

    event.participants[0].fixedAmount = 5500;
    const amounts = amountsOf(event);
    const state = collectionOf(event.participants[0], amounts[event.participants[0].id]);

    expect(state.status).toBe('over');
    expect(state.excess).toBe(500);
    expect(summarize(event.participants, amounts).overpaidAmount).toBe(500);
  });

  it('Case 9: 5段階→固定額に変えても、回収した事実は消えない', () => {
    const event = buildEvent(
      [{ name: '田中', level: 'normal' }, { name: 'A', level: 'normal' }],
      12000,
    );
    expect(collect(event, 0)).toBe(6000);

    event.participants[0].chargeMode = 'fixed';
    event.participants[0].fixedAmount = 7000;

    const amounts = amountsOf(event);
    const state = collectionOf(event.participants[0], amounts[event.participants[0].id]);
    expect(event.participants[0].collectedAmount).toBe(6000);
    expect(state.due).toBe(7000);
    expect(state.status).toBe('short');
    expect(state.shortage).toBe(1000);
  });

  it('Case 10: 固定額→5段階に戻しても、回収した事実は消えず差額を判定できる', () => {
    const event = buildEvent(
      [{ name: '田中', fixed: 8000, level: 'normal' }, { name: 'A', level: 'normal' }],
      20000,
    );
    expect(collect(event, 0)).toBe(8000);

    // 5段階へ戻すと、覚えておいた「ふつう」が使われる
    event.participants[0].chargeMode = 'weighted';
    expect(event.participants[0].level).toBe('normal');
    // 固定額の入力値も消さない
    expect(event.participants[0].fixedAmount).toBe(8000);

    const amounts = amountsOf(event);
    expect(amounts[event.participants[0].id]).toBe(10000);
    const state = collectionOf(event.participants[0], amounts[event.participants[0].id]);
    expect(state.paid).toBe(8000);
    expect(state.status).toBe('short');
    expect(state.shortage).toBe(2000);
  });

  it('Case 21: 全員未回収に戻しても固定額は消えない', () => {
    const event = buildEvent([{ name: '田中', fixed: 6000 }, { name: 'A', level: 'normal' }], 20000);
    collect(event, 0);

    const reset = event.participants.map((participant) => ({
      ...participant,
      collected: false,
      collectedAt: null,
      collectedAmount: null,
    }));

    expect(reset[0].chargeMode).toBe('fixed');
    expect(reset[0].fixedAmount).toBe(6000);
    expect(reset[0].collectedAmount).toBeNull();
  });

  it('Case 11: 飲み会を複製すると徴収方法と固定額は残り、回収情報は消える', () => {
    const event = buildEvent(
      [
        { name: '田中部長', fixed: 10000 },
        { name: '山田', level: 'more' },
      ],
      30000,
    );
    event.participants[0].memo = '部長';
    collect(event, 0);

    const copy = duplicateEvent(event, '忘年会');
    expect(copy.totalAmount).toBe(0);
    expect(copy.participants[0].chargeMode).toBe('fixed');
    expect(copy.participants[0].fixedAmount).toBe(10000);
    expect(copy.participants[0].memo).toBe('部長');
    expect(copy.participants[1].level).toBe('more');
    copy.participants.forEach((participant) => {
      expect(participant.collected).toBe(false);
      expect(participant.collectedAt).toBeNull();
      expect(participant.collectedAmount).toBeNull();
    });
  });

  it('保存して読み戻しても徴収方法と固定額が変わらない', () => {
    const event = buildEvent([{ name: '田中', fixed: 6500 }, { name: 'A', level: 'more' }], 20000);
    const restored = parseStore(serializeStore({ version: 3, events: [event] })).events[0];
    expect(restored.participants[0].chargeMode).toBe('fixed');
    expect(restored.participants[0].fixedAmount).toBe(6500);
    expect(restored.participants[1].chargeMode).toBe('weighted');
    expect(restored.participants[1].fixedAmount).toBeNull();
    expect(restored.participants[1].level).toBe('more');
  });
});

describe('Case 12: v2 → v3 移行', () => {
  const v2Raw = JSON.stringify({
    version: 2,
    events: [
      {
        id: 'e1',
        name: '前回の飲み会',
        totalAmount: 24000,
        roundingUnit: 100,
        weights: { less: 50, slightlyLess: 80, normal: 100, slightlyMore: 120, more: 150 },
        participants: [
          {
            id: 'p1',
            name: '田中',
            level: 'more',
            attendance: 'attending',
            memo: '部長',
            collected: true,
            collectedAt: '2026-08-01T10:00:00.000Z',
            collectedAmount: 6000,
          },
          {
            id: 'p2',
            name: '佐藤',
            level: 'normal',
            attendance: 'absent',
            memo: '',
            collected: false,
            collectedAt: null,
            collectedAmount: null,
          },
        ],
        createdAt: '2026-08-01T09:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
      },
    ],
  });

  it('クラッシュせず読み込め、名簿と設定が保たれる', () => {
    const store = parseStore(v2Raw);
    expect(store.version).toBe(3);
    expect(store.events).toHaveLength(1);

    const [event] = store.events;
    expect(event.name).toBe('前回の飲み会');
    expect(event.totalAmount).toBe(24000);
    expect(event.participants).toHaveLength(2);
    expect(event.participants[0].name).toBe('田中');
    expect(event.participants[0].level).toBe('more');
    expect(event.participants[0].memo).toBe('部長');
    expect(event.participants[1].attendance).toBe('absent');
  });

  it('chargeMode は weighted、fixedAmount は null になる', () => {
    const [event] = parseStore(v2Raw).events;
    event.participants.forEach((participant) => {
      expect(participant.chargeMode).toBe('weighted');
      expect(participant.fixedAmount).toBeNull();
    });
  });

  it('回収情報（collectedAmount）を移行で壊さない', () => {
    const [event] = parseStore(v2Raw).events;
    expect(event.participants[0].collected).toBe(true);
    expect(event.participants[0].collectedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(event.participants[0].collectedAmount).toBe(6000);
  });

  it('移行後も今までどおり計算できる', () => {
    const [event] = parseStore(v2Raw).events;
    const restored: OrganizerEvent = {
      ...event,
      participants: event.participants.map((participant) => ({
        ...participant,
        attendance: 'attending' as const,
      })),
    };
    const result = calculateOrganizerSplit(restored);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.sum).toBe(24000);
    expect(totalOf(restored.participants, result.amounts)).toBe(24000);
  });

  it('壊れた chargeMode / fixedAmount は安全な値に直す', () => {
    const raw = JSON.stringify({
      version: 3,
      events: [
        {
          id: 'e1',
          name: 'こわれたデータ',
          totalAmount: 10000,
          roundingUnit: 100,
          participants: [
            { id: 'p1', name: 'A', chargeMode: 'なぞ', fixedAmount: 'たくさん' },
            { id: 'p2', name: 'B', chargeMode: 'fixed', fixedAmount: -500 },
            { id: 'p3', name: 'C', chargeMode: 'fixed', fixedAmount: 1234.56 },
          ],
        },
      ],
    });
    const [event] = parseStore(raw).events;
    expect(event.participants[0].chargeMode).toBe('weighted');
    expect(event.participants[0].fixedAmount).toBeNull();
    // 負の値は「未入力」に倒す（負の徴収額を作らないため）
    expect(event.participants[1].fixedAmount).toBeNull();
    // 小数は切り捨てて円単位にする
    expect(event.participants[2].fixedAmount).toBe(1234);
  });
});

/**
 * 「固定額を選んだのに金額が空」のときの挙動。
 * 空欄（null）と 0円 をはっきり区別する。
 */
describe('固定額の未入力（空欄 ≠ 0円）', () => {
  function withFixed(amount: number | null, absent = false): OrganizerEvent {
    const event = buildEvent([{ name: '田中' }, { name: '佐藤' }], 20000);
    event.participants[0].chargeMode = 'fixed';
    event.participants[0].fixedAmount = amount;
    if (absent) event.participants[0].attendance = 'absent';
    return event;
  }

  it('1. 出席・固定額・未入力 → 計算失敗し、5段階として計算されない', () => {
    const event = withFixed(null);
    const result = calculateOrganizerSplit(event);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('fixedAmountMissing');

    // 金額がまったく出ない（前の結果が残らない）
    const amounts = result.ok ? result.amounts : {};
    expect(amounts[event.participants[0].id]).toBeUndefined();
    expect(amounts[event.participants[1].id]).toBeUndefined();

    // 5段階の人数にも数えない
    expect(toLevelCounts(event.participants)).toEqual({
      less: 0,
      slightlyLess: 0,
      normal: 1,
      slightlyMore: 0,
      more: 0,
    });
  });

  it('2. 出席・固定額・0円 → 正常に0円として扱う', () => {
    const event = withFixed(0);
    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');

    expect(result.amounts[event.participants[0].id]).toBe(0);
    expect(result.amounts[event.participants[1].id]).toBe(20000);
    expect(totalOf(event.participants, result.amounts)).toBe(20000);
  });

  it('3. 出席・固定額・5,000円 → 正常に5,000円', () => {
    const event = withFixed(5000);
    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');

    expect(result.amounts[event.participants[0].id]).toBe(5000);
    expect(result.amounts[event.participants[1].id]).toBe(15000);
    expect(totalOf(event.participants, result.amounts)).toBe(20000);
  });

  it('4. 欠席・固定額・未入力 → 計算を妨げない', () => {
    const event = withFixed(null, true);
    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');

    expect(result.attendingCount).toBe(1);
    expect(result.amounts[event.participants[1].id]).toBe(20000);
    expect(totalOf(event.participants, result.amounts)).toBe(20000);
  });

  it('5. 未入力の状態から金額を入れると、すぐ正常な計算に戻る', () => {
    const event = withFixed(null);
    expect(calculateOrganizerSplit(event).ok).toBe(false);

    event.participants[0].fixedAmount = 5000;
    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.amounts[event.participants[0].id]).toBe(5000);
    expect(totalOf(event.participants, result.amounts)).toBe(20000);
  });

  it('6. 5段階へ戻すと、保存されていた元の負担レベルで正常に計算できる', () => {
    const event = buildEvent([{ name: '田中', level: 'more' }, { name: '佐藤' }], 20000);
    // 固定額に切り替えたが金額は未入力
    event.participants[0].chargeMode = 'fixed';
    event.participants[0].fixedAmount = null;
    expect(calculateOrganizerSplit(event).ok).toBe(false);

    // 5段階へ戻す。level は消していないので 'more' のまま
    event.participants[0].chargeMode = 'weighted';
    expect(event.participants[0].level).toBe('more');

    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(toLevelCounts(event.participants).more).toBe(1);
    expect(result.amounts[event.participants[0].id]).toBeGreaterThan(
      result.amounts[event.participants[1].id],
    );
    expect(totalOf(event.participants, result.amounts)).toBe(20000);
  });

  it('複数人が未入力なら人数分の名前を返す（画面では先頭だけ出す）', () => {
    const event = buildEvent([{ name: '田中' }, { name: '佐藤' }, { name: '鈴木' }], 30000);
    event.participants[0].chargeMode = 'fixed';
    event.participants[0].fixedAmount = null;
    event.participants[1].chargeMode = 'fixed';
    event.participants[1].fixedAmount = null;

    const result = calculateOrganizerSplit(event);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('fixedAmountMissing');
      expect(result.names).toEqual(['田中', '佐藤']);
    }
  });

  it('未入力の間は徴収予定額が出ず、回収チェックもできない状態になる', () => {
    const event = withFixed(null);
    const result = calculateOrganizerSplit(event);
    const amounts = result.ok ? result.amounts : {};

    // UI は amount === null のときチェックボックスを無効にする
    event.participants.forEach((participant) => {
      expect(amounts[participant.id]).toBeUndefined();
    });

    // 集計も0のまま（古い金額が残らない）
    const summary = summarize(event.participants, amounts);
    expect(summary.expectedAmount).toBe(0);
    expect(summary.collectedAmount).toBe(0);
  });

  it('既に回収済みの人がいても、回収記録は消えない', () => {
    const event = withFixed(6000);
    const amounts = amountsOf(event);
    const tanaka = event.participants[0];
    tanaka.collected = true;
    tanaka.collectedAt = new Date().toISOString();
    tanaka.collectedAmount = amounts[tanaka.id];

    // 金額を消して未入力に戻す
    tanaka.fixedAmount = null;
    expect(calculateOrganizerSplit(event).ok).toBe(false);
    // collectedAmount は保持されたまま
    expect(tanaka.collectedAmount).toBe(6000);

    // 入れ直せば差額判定が働く
    tanaka.fixedAmount = 6500;
    const after = amountsOf(event);
    expect(collectionOf(tanaka, after[tanaka.id]).status).toBe('short');
    expect(collectionOf(tanaka, after[tanaka.id]).shortage).toBe(500);
  });
});
