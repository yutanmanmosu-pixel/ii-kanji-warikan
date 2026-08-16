import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '../../constants/split';
import {
  calculateOrganizerSplit,
  collectionOf,
  matchesParticipantFilter,
  summarize,
} from './calculation';
import { createEvent, createParticipant, duplicateEvent, parseStore, serializeStore } from './storage';
import type { OrganizerEvent, ParticipantFilter } from '../types';

/**
 * 「回収済みにしたあとで徴収予定額が変わる」ケースの検証。
 * 受け取った金額を collectedAmount に記録し、あとから書き換えないことが要点。
 */

function fourPeopleEvent(total: number): OrganizerEvent {
  const event = createEvent('テスト飲み会');
  event.weights = { ...DEFAULT_WEIGHTS };
  event.roundingUnit = 100;
  event.totalAmount = total;
  event.participants = ['田中', '佐藤', '鈴木', '高橋'].map((name) => createParticipant(name, 'normal'));
  return event;
}

/** 現在の徴収予定額で「回収済み」にする（画面のチェック操作と同じ動き） */
function collect(event: OrganizerEvent, index: number): number {
  const calculation = calculateOrganizerSplit(event);
  if (!calculation.ok) throw new Error('計算に失敗しました');
  const participant = event.participants[index];
  const due = calculation.amounts[participant.id] ?? 0;
  participant.collected = true;
  participant.collectedAt = new Date().toISOString();
  participant.collectedAmount = due;
  return due;
}

function summaryOf(event: OrganizerEvent) {
  const calculation = calculateOrganizerSplit(event);
  if (!calculation.ok) throw new Error('計算に失敗しました');
  return { summary: summarize(event.participants, calculation.amounts), amounts: calculation.amounts };
}

describe('回収済みのあとで徴収額が変わった場合', () => {
  it('ケース1: 6,000円回収後に徴収予定が6,500円になっても、全額回収済みとは扱わない', () => {
    const event = fourPeopleEvent(24000);
    const paid = collect(event, 0);
    expect(paid).toBe(6000);

    // 会計金額が増え、1人あたりの徴収額が上がった
    event.totalAmount = 26000;
    const { summary, amounts } = summaryOf(event);
    const tanaka = event.participants[0];

    expect(amounts[tanaka.id]).toBe(6500);
    // 受け取った額は6,000円のまま
    expect(tanaka.collectedAmount).toBe(6000);

    const collection = collectionOf(tanaka, amounts[tanaka.id]);
    expect(collection.status).toBe('short');
    expect(collection.paid).toBe(6000);
    expect(collection.due).toBe(6500);
    expect(collection.shortage).toBe(500);

    // 集計でも6,500円を回収済みとして数えない
    expect(summary.collectedAmount).toBe(6000);
    expect(summary.shortCount).toBe(1);
    expect(summary.isComplete).toBe(false);
    // 残りは 26,000 - 6,000 = 20,000
    expect(summary.remainingAmount).toBe(20000);
  });

  it('ケース2: 徴収予定が5,500円に下がったら、500円の過剰回収と判別できる', () => {
    const event = fourPeopleEvent(24000);
    collect(event, 0);

    event.totalAmount = 22000;
    const { summary, amounts } = summaryOf(event);
    const tanaka = event.participants[0];

    expect(amounts[tanaka.id]).toBe(5500);
    const collection = collectionOf(tanaka, amounts[tanaka.id]);
    expect(collection.status).toBe('over');
    expect(collection.excess).toBe(500);

    expect(summary.overpaidAmount).toBe(500);
    expect(summary.overCount).toBe(1);
    // 過剰があるうちは「集め終わった」と言わない
    expect(summary.isComplete).toBe(false);
  });

  it('ケース3: 回収前に徴収額が変わったら、普通に新しい金額になる', () => {
    const event = fourPeopleEvent(24000);
    event.totalAmount = 26000;

    const { summary, amounts } = summaryOf(event);
    const tanaka = event.participants[0];
    expect(amounts[tanaka.id]).toBe(6500);

    const collection = collectionOf(tanaka, amounts[tanaka.id]);
    expect(collection.status).toBe('unpaid');
    expect(collection.due).toBe(6500);
    expect(summary.collectedAmount).toBe(0);
    expect(summary.remainingAmount).toBe(26000);
  });

  it('差額を精算すると、過不足なく集め終わった状態になる', () => {
    const event = fourPeopleEvent(24000);
    event.participants.forEach((_participant, index) => collect(event, index));
    expect(summaryOf(event).summary.isComplete).toBe(true);

    event.totalAmount = 26000;
    let state = summaryOf(event);
    expect(state.summary.isComplete).toBe(false);
    expect(state.summary.remainingAmount).toBe(2000);

    // 画面の「差額も回収した」に相当する操作
    event.participants.forEach((participant) => {
      participant.collectedAmount = state.amounts[participant.id] ?? 0;
    });

    state = summaryOf(event);
    expect(state.summary.collectedAmount).toBe(26000);
    expect(state.summary.remainingAmount).toBe(0);
    expect(state.summary.isComplete).toBe(true);
  });

  it('負担レベルの変更でも同じように差額を検出する', () => {
    const event = fourPeopleEvent(24000);
    collect(event, 0);
    event.participants[0].level = 'more';

    const { amounts } = summaryOf(event);
    const collection = collectionOf(event.participants[0], amounts[event.participants[0].id]);
    expect(collection.status).toBe('short');
    expect(collection.paid).toBe(6000);
  });

  it('回収済みの人を欠席にすると、受け取った分が過剰として残る', () => {
    const event = fourPeopleEvent(24000);
    collect(event, 0);
    event.participants[0].attendance = 'absent';

    const { summary, amounts } = summaryOf(event);
    const collection = collectionOf(event.participants[0], amounts[event.participants[0].id] ?? 0);
    expect(collection.status).toBe('over');
    expect(collection.excess).toBe(6000);
    expect(summary.overpaidAmount).toBe(6000);
  });

  it('ケース4: 全員未回収に戻すと、回収に関するデータが初期化される', () => {
    const event = fourPeopleEvent(24000);
    event.participants.forEach((_participant, index) => collect(event, index));

    // 画面の「全員を未回収に戻す」と同じ処理
    event.participants = event.participants.map((participant) => ({
      ...participant,
      collected: false,
      collectedAt: null,
      collectedAmount: null,
    }));

    event.participants.forEach((participant) => {
      expect(participant.collected).toBe(false);
      expect(participant.collectedAt).toBeNull();
      expect(participant.collectedAmount).toBeNull();
    });

    const { summary } = summaryOf(event);
    expect(summary.collectedAmount).toBe(0);
    expect(summary.remainingAmount).toBe(24000);
    expect(summary.unknownCount).toBe(0);
  });

  it('ケース5: 飲み会を複製しても回収情報を引き継がない', () => {
    const event = fourPeopleEvent(24000);
    event.participants.forEach((_participant, index) => collect(event, index));

    const copy = duplicateEvent(event, '次の飲み会');
    expect(copy.totalAmount).toBe(0);
    copy.participants.forEach((participant) => {
      expect(participant.collected).toBe(false);
      expect(participant.collectedAt).toBeNull();
      expect(participant.collectedAmount).toBeNull();
    });
    // 名簿と負担レベルは引き継ぐ
    expect(copy.participants.map((participant) => participant.name)).toEqual([
      '田中',
      '佐藤',
      '鈴木',
      '高橋',
    ]);
  });

  it('回収した金額は保存して読み戻しても変わらない', () => {
    const event = fourPeopleEvent(24000);
    collect(event, 0);
    const restored = parseStore(serializeStore({ version: 2, events: [event] })).events[0];
    expect(restored.participants[0].collectedAmount).toBe(6000);
    expect(restored.participants[1].collectedAmount).toBeNull();
  });
});

describe('ケース6: 古い保存データ（v1・collectedAmountなし）', () => {
  const legacyRaw = JSON.stringify({
    version: 1,
    events: [
      {
        id: 'e1',
        name: '去年の忘年会',
        totalAmount: 24000,
        roundingUnit: 100,
        weights: { less: 50, slightlyLess: 80, normal: 100, slightlyMore: 120, more: 150 },
        participants: [
          {
            id: 'p1',
            name: '田中',
            level: 'normal',
            attendance: 'attending',
            memo: '',
            collected: true,
            collectedAt: '2026-08-01T10:00:00.000Z',
          },
          { id: 'p2', name: '佐藤', level: 'normal', attendance: 'attending', memo: '', collected: false },
          { id: 'p3', name: '鈴木', level: 'normal', attendance: 'attending', memo: '', collected: false },
          { id: 'p4', name: '高橋', level: 'normal', attendance: 'attending', memo: '', collected: false },
        ],
        createdAt: '2026-08-01T09:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
      },
    ],
  });

  it('クラッシュせずに読み込め、名簿が消えない', () => {
    const store = parseStore(legacyRaw);
    expect(store.events).toHaveLength(1);
    expect(store.events[0].participants).toHaveLength(4);
    expect(store.events[0].participants[0].name).toBe('田中');
    expect(store.events[0].name).toBe('去年の忘年会');
  });

  it('回収金額を勝手に推測せず、「記録なし」として扱う', () => {
    const store = parseStore(legacyRaw);
    const event = store.events[0];
    const tanaka = event.participants[0];

    expect(tanaka.collected).toBe(true);
    expect(tanaka.collectedAmount).toBeNull();
    expect(tanaka.collectedAt).toBe('2026-08-01T10:00:00.000Z');

    const { summary, amounts } = summaryOf(event);
    const collection = collectionOf(tanaka, amounts[tanaka.id]);
    expect(collection.status).toBe('unknown');
    // 金額が分からないので、回収済み金額には足さない
    expect(summary.collectedAmount).toBe(0);
    expect(summary.unknownCount).toBe(1);
    expect(summary.isComplete).toBe(false);
  });

  it('金額を確定すると通常の回収済みになる', () => {
    const store = parseStore(legacyRaw);
    const event = store.events[0];
    const { amounts } = summaryOf(event);
    const tanaka = event.participants[0];
    tanaka.collectedAmount = amounts[tanaka.id] ?? 0;

    const collection = collectionOf(tanaka, amounts[tanaka.id]);
    expect(collection.status).toBe('settled');
    expect(summaryOf(event).summary.unknownCount).toBe(0);
  });

  // 固定額対応で Participant に chargeMode / fixedAmount が増えたため、
  // 保存バージョンは 2 から 3 に上がっている。v1 からも直接 v3 へ移行する。
  it('保存し直すと最新バージョン（3）になる', () => {
    const store = parseStore(legacyRaw);
    expect(store.version).toBe(3);
    expect(JSON.parse(serializeStore(store)).version).toBe(3);
  });

  it('v1データも固定額の項目が補われる（全員5段階）', () => {
    const [event] = parseStore(legacyRaw).events;
    event.participants.forEach((participant) => {
      expect(participant.chargeMode).toBe('weighted');
      expect(participant.fixedAmount).toBeNull();
    });
  });
});

/**
 * サマリーの人数と、名簿の絞り込みが同じ基準になっていることの確認。
 * 以前は collected フラグで人数を数えていたため、
 * 差額が出ている人が「回収済み」に入る一方で絞り込みでは「未回収」に出ていた。
 */
describe('サマリーの人数と名簿の絞り込みの整合', () => {
  /** 4人・24,000円 → 全員6,000円 */
  function twoCollectedEvent(): OrganizerEvent {
    const event = fourPeopleEvent(24000);
    collect(event, 0);
    collect(event, 1);
    return event;
  }

  function statusesOf(event: OrganizerEvent) {
    const calculation = calculateOrganizerSplit(event);
    if (!calculation.ok) throw new Error('計算に失敗しました');
    return event.participants.map((participant) =>
      collectionOf(participant, calculation.amounts[participant.id] ?? 0),
    );
  }

  function countByFilter(event: OrganizerEvent, filter: ParticipantFilter): number {
    return statusesOf(event).filter((collection) =>
      matchesParticipantFilter(collection.status, filter),
    ).length;
  }

  it('6,000円回収後に徴収予定が6,500円になると、精算完了に数えない', () => {
    const event = twoCollectedEvent();
    event.totalAmount = 26000;

    const { summary } = summaryOf(event);
    const statuses = statusesOf(event).map((collection) => collection.status);
    expect(statuses).toEqual(['short', 'short', 'unpaid', 'unpaid']);

    // 個人：あと500円
    expect(statusesOf(event)[0].shortage).toBe(500);
    // 精算完了人数にカウントされない
    expect(summary.settledCount).toBe(0);
    expect(summary.shortCount).toBe(2);
    expect(summary.unpaidCount).toBe(2);
    expect(summary.actionNeededCount).toBe(4);
    // 要対応フィルターに4人とも表示される
    expect(countByFilter(event, 'action')).toBe(4);
    expect(countByFilter(event, 'settled')).toBe(0);
  });

  it('2人settled・1人short・1人unpaid なら「精算完了 2 / 4人」になる', () => {
    const event = fourPeopleEvent(24000);
    collect(event, 0);
    collect(event, 1);
    collect(event, 2);
    // 3人目だけ、あとから徴収予定が上がった状況を作る
    event.participants[2].collectedAmount = 5500;

    const { summary } = summaryOf(event);
    expect(statusesOf(event).map((collection) => collection.status)).toEqual([
      'settled',
      'settled',
      'short',
      'unpaid',
    ]);
    expect(summary.settledCount).toBe(2);
    expect(summary.attendingCount).toBe(4);
    expect(summary.actionNeededCount).toBe(2);
    expect(countByFilter(event, 'settled')).toBe(2);
    expect(countByFilter(event, 'action')).toBe(2);
  });

  it('サマリーの人数と絞り込みの件数が常に一致する', () => {
    const event = fourPeopleEvent(24000);
    collect(event, 0); // settled
    collect(event, 1);
    event.participants[1].collectedAmount = 5000; // short
    collect(event, 2);
    event.participants[2].collectedAmount = 7000; // over
    event.participants.push(createParticipant('高橋2', 'normal'));
    event.participants[4].attendance = 'absent';
    const withUnknown = createParticipant('記録なし', 'normal');
    withUnknown.collected = true;
    withUnknown.collectedAt = new Date().toISOString();
    withUnknown.collectedAmount = null;
    event.participants.push(withUnknown);

    const { summary } = summaryOf(event);

    expect(countByFilter(event, 'settled')).toBe(summary.settledCount);
    expect(countByFilter(event, 'action')).toBe(summary.actionNeededCount);
    expect(countByFilter(event, 'absent')).toBe(summary.absentCount);
    expect(countByFilter(event, 'all')).toBe(summary.totalCount);
  });

  it('出席者の内訳の合計が、必ず参加人数と一致する', () => {
    const event = fourPeopleEvent(24000);
    collect(event, 0);
    collect(event, 1);
    event.participants[1].collectedAmount = 5000;
    event.participants[3].attendance = 'absent';

    const { summary } = summaryOf(event);
    const breakdown =
      summary.settledCount +
      summary.unpaidCount +
      summary.shortCount +
      summary.overCount +
      summary.unknownCount;
    expect(breakdown).toBe(summary.attendingCount);
    expect(summary.settledCount + summary.actionNeededCount).toBe(summary.attendingCount);
  });

  it('欠席なのに回収記録が残っている人は、出席者の内訳に混ざらない', () => {
    const event = fourPeopleEvent(24000);
    collect(event, 0);
    event.participants[0].attendance = 'absent';

    const { summary } = summaryOf(event);
    expect(summary.attendingCount).toBe(3);
    expect(summary.settledCount + summary.actionNeededCount).toBe(3);
    expect(summary.absentCollectedCount).toBe(1);
    expect(summary.overpaidAmount).toBe(6000);
    expect(summary.isComplete).toBe(false);
  });

  it('全員が精算完了なら要対応が0になり、完了と判定する', () => {
    const event = fourPeopleEvent(24000);
    event.participants.forEach((_participant, index) => collect(event, index));

    const { summary } = summaryOf(event);
    expect(summary.settledCount).toBe(4);
    expect(summary.actionNeededCount).toBe(0);
    expect(summary.remainingAmount).toBe(0);
    expect(summary.overpaidAmount).toBe(0);
    expect(summary.isComplete).toBe(true);
    expect(countByFilter(event, 'action')).toBe(0);
  });

  it('金額の記録がない人は要確認として要対応に入る', () => {
    const event = fourPeopleEvent(24000);
    const target = event.participants[0];
    target.collected = true;
    target.collectedAt = new Date().toISOString();
    target.collectedAmount = null;

    const { summary } = summaryOf(event);
    expect(summary.unknownCount).toBe(1);
    expect(summary.settledCount).toBe(0);
    expect(summary.actionNeededCount).toBe(4);
    expect(countByFilter(event, 'action')).toBe(4);
  });
});
