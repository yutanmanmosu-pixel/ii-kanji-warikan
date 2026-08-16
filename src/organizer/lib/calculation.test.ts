import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '../../constants/split';
import { calculateOrganizerSplit, summarize, toLevelCounts } from './calculation';
import { createEvent, createParticipant, duplicateEvent } from './storage';
import type { LevelId } from '../../types/split';
import type { OrganizerEvent, OrganizerParticipant } from '../types';

function eventWith(
  people: {
    name: string;
    level?: LevelId;
    absent?: boolean;
    collected?: boolean;
    /** 実際に受け取った額。省略すると「そのときの徴収予定額を受け取った」ことにする */
    paid?: number;
  }[],
  total: number,
): OrganizerEvent {
  const event = createEvent('テスト飲み会');
  event.totalAmount = total;
  event.weights = { ...DEFAULT_WEIGHTS };
  event.participants = people.map((person) => {
    const participant = createParticipant(person.name, person.level ?? 'normal');
    if (person.absent) participant.attendance = 'absent';
    if (person.collected) {
      participant.collected = true;
      participant.collectedAt = new Date().toISOString();
      participant.collectedAmount = person.paid ?? null;
    }
    return participant;
  });

  // paid を指定しなかった回収済みの人には、その時点の徴収予定額を入れる
  const calculated = calculateOrganizerSplit(event);
  if (calculated.ok) {
    event.participants.forEach((participant, index) => {
      if (participant.collected && people[index].paid === undefined) {
        participant.collectedAmount = calculated.amounts[participant.id] ?? 0;
      }
    });
  }
  return event;
}

function sumAmounts(participants: OrganizerParticipant[], amounts: Record<string, number>): number {
  return participants.reduce((sum, participant) => sum + (amounts[participant.id] ?? 0), 0);
}

describe('toLevelCounts', () => {
  it('1. 参加者を5段階の人数へ集約できる', () => {
    const event = eventWith(
      [
        { name: '田中部長', level: 'more' },
        { name: '山田課長', level: 'slightlyMore' },
        { name: '佐藤', level: 'normal' },
        { name: '高橋', level: 'normal' },
        { name: '鈴木', level: 'less' },
      ],
      30000,
    );
    expect(toLevelCounts(event.participants)).toEqual({
      less: 1,
      slightlyLess: 0,
      normal: 2,
      slightlyMore: 1,
      more: 1,
    });
  });

  it('2. 欠席者は集約に含まれない', () => {
    const event = eventWith(
      [
        { name: '田中', level: 'normal' },
        { name: '佐藤', level: 'normal', absent: true },
      ],
      10000,
    );
    expect(toLevelCounts(event.participants).normal).toBe(1);
  });
});

describe('calculateOrganizerSplit', () => {
  it('3. 全参加者の徴収額合計が会計金額と一致する', () => {
    const event = eventWith(
      [
        { name: '田中部長', level: 'more' },
        { name: '山田課長', level: 'slightlyMore' },
        { name: '佐藤', level: 'normal' },
        { name: '鈴木', level: 'less' },
      ],
      48600,
    );
    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.sum).toBe(48600);
    expect(sumAmounts(event.participants, result.amounts)).toBe(48600);
  });

  it('3-2. 丸め単位を変えても合計は会計金額と一致する', () => {
    for (const unit of [1, 10, 100, 500, 1000] as const) {
      const event = eventWith(
        [
          { name: 'A', level: 'more' },
          { name: 'B', level: 'normal' },
          { name: 'C', level: 'normal' },
          { name: 'D', level: 'less' },
          { name: 'E', level: 'slightlyLess' },
        ],
        42837,
      );
      event.roundingUnit = unit;
      const result = calculateOrganizerSplit(event);
      if (!result.ok) throw new Error('計算に失敗しました');
      expect(sumAmounts(event.participants, result.amounts)).toBe(42837);
    }
  });

  it('2-2. 欠席者は徴収額を持たず、参加者だけで合計が一致する', () => {
    const event = eventWith(
      [
        { name: '田中', level: 'normal' },
        { name: '佐藤', level: 'normal', absent: true },
        { name: '鈴木', level: 'normal' },
      ],
      20000,
    );
    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.attendingCount).toBe(2);
    expect(result.amounts[event.participants[1].id]).toBeUndefined();
    expect(sumAmounts(event.participants, result.amounts)).toBe(20000);
  });

  it('2-3. 欠席から参加に戻すと再計算される', () => {
    const event = eventWith(
      [
        { name: '田中', level: 'normal' },
        { name: '佐藤', level: 'normal', absent: true },
      ],
      20000,
    );
    expect(calculateOrganizerSplit(event).ok).toBe(true);

    const restored: OrganizerEvent = {
      ...event,
      participants: event.participants.map((participant) => ({
        ...participant,
        attendance: 'attending' as const,
      })),
    };
    const result = calculateOrganizerSplit(restored);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.attendingCount).toBe(2);
    expect(sumAmounts(restored.participants, result.amounts)).toEqual(20000);
  });

  it('9. 同姓同名でも別々の徴収額を持てる', () => {
    const event = eventWith(
      [
        { name: '鈴木', level: 'more' },
        { name: '鈴木', level: 'less' },
      ],
      10000,
    );
    const [first, second] = event.participants;
    expect(first.id).not.toBe(second.id);

    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');
    expect(result.amounts[first.id]).toBeGreaterThan(result.amounts[second.id]);
    expect(sumAmounts(event.participants, result.amounts)).toBe(10000);
  });

  it('負担レベルが高い人ほど徴収額が多い', () => {
    const event = eventWith(
      [
        { name: 'A', level: 'less' },
        { name: 'B', level: 'slightlyLess' },
        { name: 'C', level: 'normal' },
        { name: 'D', level: 'slightlyMore' },
        { name: 'E', level: 'more' },
      ],
      50000,
    );
    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');
    const values = event.participants.map((participant) => result.amounts[participant.id]);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
  });

  it('会計金額が0円・参加者0人ならエラーコードを返す', () => {
    const noAmount = eventWith([{ name: 'A' }], 0);
    const noPeople = eventWith([], 10000);
    const allAbsent = eventWith([{ name: 'A', absent: true }], 10000);

    expect(calculateOrganizerSplit(noAmount).ok).toBe(false);
    expect(calculateOrganizerSplit(noPeople).ok).toBe(false);
    expect(calculateOrganizerSplit(allAbsent).ok).toBe(false);
  });
});

describe('summarize', () => {
  it('4. 回収済み合計が正しい / 5. 未回収合計が正しい', () => {
    const event = eventWith(
      [
        { name: 'A', level: 'normal', collected: true },
        { name: 'B', level: 'normal', collected: true },
        { name: 'C', level: 'normal' },
        { name: 'D', level: 'normal' },
      ],
      40000,
    );
    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');

    const summary = summarize(event.participants, result.amounts);
    expect(summary.attendingCount).toBe(4);
    expect(summary.settledCount).toBe(2);
    expect(summary.unpaidCount).toBe(2);
    expect(summary.actionNeededCount).toBe(2);
    expect(summary.expectedAmount).toBe(40000);
    expect(summary.collectedAmount).toBe(20000);
    expect(summary.remainingAmount).toBe(20000);
    expect(summary.collectedAmount + summary.remainingAmount).toBe(40000);
    expect(summary.isComplete).toBe(false);
  });

  it('欠席者は集計に含まれない', () => {
    const event = eventWith(
      [
        { name: 'A', level: 'normal', collected: true },
        { name: 'B', level: 'normal', absent: true },
      ],
      10000,
    );
    const result = calculateOrganizerSplit(event);
    if (!result.ok) throw new Error('計算に失敗しました');

    const summary = summarize(event.participants, result.amounts);
    expect(summary.totalCount).toBe(2);
    expect(summary.attendingCount).toBe(1);
    expect(summary.absentCount).toBe(1);
    expect(summary.expectedAmount).toBe(10000);
    expect(summary.isComplete).toBe(true);
  });
});

describe('duplicateEvent', () => {
  it('10. 複製すると回収状況と会計金額がリセットされる', () => {
    const event = eventWith(
      [
        { name: '田中部長', level: 'more', collected: true },
        { name: '佐藤', level: 'normal', collected: true },
      ],
      30000,
    );
    const copy = duplicateEvent(event, '忘年会');

    expect(copy.name).toBe('忘年会');
    expect(copy.totalAmount).toBe(0);
    expect(copy.id).not.toBe(event.id);
    expect(copy.participants).toHaveLength(2);
    expect(copy.participants.map((participant) => participant.name)).toEqual(['田中部長', '佐藤']);
    expect(copy.participants.map((participant) => participant.level)).toEqual(['more', 'normal']);
    copy.participants.forEach((participant, index) => {
      expect(participant.collected).toBe(false);
      expect(participant.collectedAt).toBeNull();
      // IDは作り直す（元の飲み会と混ざらないように）
      expect(participant.id).not.toBe(event.participants[index].id);
    });
  });
});
