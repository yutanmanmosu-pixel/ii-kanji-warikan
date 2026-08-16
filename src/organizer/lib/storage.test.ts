import { describe, expect, it } from 'vitest';
import {
  createEvent,
  createParticipant,
  emptyStore,
  parseStore,
  sanitizeEvent,
  serializeStore,
} from './storage';

describe('storage', () => {
  it('6. 保存データを書き出して読み戻せる', () => {
    const event = createEvent('2026年 営業部暑気払い');
    event.totalAmount = 48600;
    event.roundingUnit = 100;
    event.participants = [createParticipant('田中部長', 'more'), createParticipant('佐藤', 'normal')];
    event.participants[0].collected = true;
    event.participants[0].collectedAt = '2026-08-16T12:00:00.000Z';
    event.participants[1].memo = '車で来ている';

    const restored = parseStore(serializeStore({ version: 1, events: [event] }));

    expect(restored.events).toHaveLength(1);
    const [loaded] = restored.events;
    expect(loaded.name).toBe('2026年 営業部暑気払い');
    expect(loaded.totalAmount).toBe(48600);
    expect(loaded.roundingUnit).toBe(100);
    expect(loaded.participants).toHaveLength(2);
    expect(loaded.participants[0].name).toBe('田中部長');
    expect(loaded.participants[0].level).toBe('more');
    expect(loaded.participants[0].collected).toBe(true);
    expect(loaded.participants[0].collectedAt).toBe('2026-08-16T12:00:00.000Z');
    expect(loaded.participants[1].memo).toBe('車で来ている');
    // IDは保存前後で変わらない（同姓同名の識別に使うため）
    expect(loaded.participants.map((p) => p.id)).toEqual(event.participants.map((p) => p.id));
  });

  it('7. 壊れた保存データでも例外を投げず空の状態を返す', () => {
    expect(parseStore(null)).toEqual(emptyStore());
    expect(parseStore('')).toEqual(emptyStore());
    expect(parseStore('{壊れたJSON')).toEqual(emptyStore());
    expect(parseStore('null')).toEqual(emptyStore());
    expect(parseStore('"文字列"')).toEqual(emptyStore());
    expect(parseStore('[1,2,3]')).toEqual(emptyStore());
    expect(parseStore('{"version":1}')).toEqual(emptyStore());
    expect(parseStore('{"version":1,"events":"こわれている"}')).toEqual(emptyStore());
  });

  it('7-2. 一部だけ壊れていても、読める範囲は安全な値に直して残す', () => {
    const raw = JSON.stringify({
      version: 1,
      events: [
        {
          id: 'e1',
          name: 12345,
          totalAmount: -100,
          roundingUnit: 7,
          weights: { normal: 'こわれている' },
          participants: [
            { id: 'p1', name: '田中', level: 'ありえないレベル', attendance: 'なぞ', collected: 'yes' },
            null,
          ],
          createdAt: 'not-a-date',
        },
      ],
    });

    const store = parseStore(raw);
    expect(store.events).toHaveLength(1);
    const [event] = store.events;
    expect(event.name).toBe('');
    expect(event.totalAmount).toBe(0);
    expect(event.roundingUnit).toBe(100);
    expect(event.weights.normal).toBe(100);
    expect(event.participants).toHaveLength(2);
    expect(event.participants[0].level).toBe('normal');
    expect(event.participants[0].attendance).toBe('attending');
    expect(event.participants[0].collected).toBe(false);
    // null の要素もIDを振り直して復元する
    expect(event.participants[1].id).not.toBe('');
    expect(Date.parse(event.createdAt)).not.toBeNaN();
  });

  it('7-3. 回収済みでないのに回収日時が残っていたら消す', () => {
    const event = sanitizeEvent({
      participants: [{ name: 'A', collected: false, collectedAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(event?.participants[0].collectedAt).toBeNull();
  });

  it('9-2. 同じ名前でも別のIDが振られる', () => {
    const first = createParticipant('鈴木');
    const second = createParticipant('鈴木');
    expect(first.id).not.toBe(second.id);
  });
});
