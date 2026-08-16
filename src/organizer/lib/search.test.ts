import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '../../constants/split';
import {
  calculateOrganizerSplit,
  collectionOf,
  matchesParticipantFilter,
  matchesParticipantSearch,
  summarize,
} from './calculation';
import { createEvent, createParticipant } from './storage';
import type { OrganizerEvent, ParticipantFilter } from '../types';

describe('matchesParticipantSearch', () => {
  it('完全一致する', () => {
    expect(matchesParticipantSearch('田中部長', '田中部長')).toBe(true);
  });

  it('部分一致する', () => {
    expect(matchesParticipantSearch('田中部長', '田')).toBe(true);
    expect(matchesParticipantSearch('山田さん', '田')).toBe(true);
    expect(matchesParticipantSearch('鈴木さん', '田')).toBe(false);
  });

  it('空の検索文字列はすべて通す', () => {
    expect(matchesParticipantSearch('田中部長', '')).toBe(true);
    expect(matchesParticipantSearch('', '')).toBe(true);
    // 空白だけの入力も「検索なし」として扱う
    expect(matchesParticipantSearch('田中部長', '   ')).toBe(true);
    expect(matchesParticipantSearch('田中部長', '　')).toBe(true);
  });

  it('アルファベットの大文字小文字を区別しない', () => {
    expect(matchesParticipantSearch('Tanaka', 'tanaka')).toBe(true);
    expect(matchesParticipantSearch('tanaka', 'TANAKA')).toBe(true);
    expect(matchesParticipantSearch('Tanaka Taro', 'TARO')).toBe(true);
  });

  it('NFKCで全角と半角の違いを吸収する', () => {
    expect(matchesParticipantSearch('ＴＡＮＡＫＡ', 'tanaka')).toBe(true);
    expect(matchesParticipantSearch('Tanaka', 'ＴＡＮＡＫＡ')).toBe(true);
    expect(matchesParticipantSearch('田中１２３', '123')).toBe(true);
    expect(matchesParticipantSearch('田中123', '１２３')).toBe(true);
  });

  it('名前の中の空白を無視して探せる', () => {
    expect(matchesParticipantSearch('田中 部長', '田中部長')).toBe(true);
    expect(matchesParticipantSearch('田中　部長', '田中部長')).toBe(true);
    expect(matchesParticipantSearch('田中部長', '田中 部長')).toBe(true);
  });

  it('該当しない名前は除外する', () => {
    expect(matchesParticipantSearch('佐藤', '田中')).toBe(false);
    expect(matchesParticipantSearch('', '田中')).toBe(false);
  });

  it('ひらがなとカタカナは変換しない（過剰実装しない方針）', () => {
    expect(matchesParticipantSearch('タナカ', 'たなか')).toBe(false);
  });
});

describe('検索とフィルターの組み合わせ', () => {
  /** 田中2人・佐藤・鈴木の4人。状態をばらけさせる。 */
  function sampleEvent(): OrganizerEvent {
    const event = createEvent('検索テスト');
    event.weights = { ...DEFAULT_WEIGHTS };
    event.roundingUnit = 100;
    event.totalAmount = 24000;
    event.participants = [
      createParticipant('田中部長', 'normal'),
      createParticipant('山田課長', 'normal'),
      createParticipant('田中さん', 'normal'),
      createParticipant('佐藤さん', 'normal'),
    ];
    return event;
  }

  function visible(event: OrganizerEvent, filter: ParticipantFilter, search: string) {
    const calculation = calculateOrganizerSplit(event);
    const amounts = calculation.ok ? calculation.amounts : {};
    return event.participants.filter((participant) => {
      const state = collectionOf(participant, amounts[participant.id] ?? 0);
      return (
        matchesParticipantFilter(state.status, filter) &&
        matchesParticipantSearch(participant.name, search)
      );
    });
  }

  it('検索なしなら全員出る', () => {
    const event = sampleEvent();
    expect(visible(event, 'all', '')).toHaveLength(4);
  });

  it('名前で絞り込める', () => {
    const event = sampleEvent();
    expect(visible(event, 'all', '田中').map((p) => p.name)).toEqual(['田中部長', '田中さん']);
    // 「田」は山田も含む
    expect(visible(event, 'all', '田')).toHaveLength(3);
  });

  it('要対応フィルター＋検索はAND条件になる', () => {
    const event = sampleEvent();
    const amounts = calculateOrganizerSplit(event);
    if (!amounts.ok) throw new Error('計算に失敗しました');

    // 田中部長だけ精算完了にする
    const tanaka = event.participants[0];
    tanaka.collected = true;
    tanaka.collectedAt = new Date().toISOString();
    tanaka.collectedAmount = amounts.amounts[tanaka.id];

    expect(visible(event, 'action', '田中').map((p) => p.name)).toEqual(['田中さん']);
    expect(visible(event, 'settled', '田中').map((p) => p.name)).toEqual(['田中部長']);
  });

  it('精算完了フィルター＋検索', () => {
    const event = sampleEvent();
    const calculation = calculateOrganizerSplit(event);
    if (!calculation.ok) throw new Error('計算に失敗しました');
    event.participants.forEach((participant) => {
      participant.collected = true;
      participant.collectedAt = new Date().toISOString();
      participant.collectedAmount = calculation.amounts[participant.id];
    });

    expect(visible(event, 'settled', '佐藤').map((p) => p.name)).toEqual(['佐藤さん']);
    expect(visible(event, 'action', '佐藤')).toHaveLength(0);
  });

  it('欠席フィルター＋検索', () => {
    const event = sampleEvent();
    event.participants[2].attendance = 'absent';

    expect(visible(event, 'absent', '田中').map((p) => p.name)).toEqual(['田中さん']);
    expect(visible(event, 'absent', '佐藤')).toHaveLength(0);
  });

  it('検索しても計算・集計の対象人数は変わらない', () => {
    const event = sampleEvent();
    const calculation = calculateOrganizerSplit(event);
    if (!calculation.ok) throw new Error('計算に失敗しました');

    // 画面上は1人しか出ていない状況
    expect(visible(event, 'all', '佐藤')).toHaveLength(1);

    // それでも計算は4人ぶん
    expect(calculation.attendingCount).toBe(4);
    expect(calculation.sum).toBe(24000);
    const summary = summarize(event.participants, calculation.amounts);
    expect(summary.totalCount).toBe(4);
    expect(summary.attendingCount).toBe(4);
    expect(summary.expectedAmount).toBe(24000);
    expect(
      event.participants.reduce((sum, p) => sum + (calculation.amounts[p.id] ?? 0), 0),
    ).toBe(24000);
  });

  it('該当者がいない検索でも計算結果は壊れない', () => {
    const event = sampleEvent();
    expect(visible(event, 'all', 'いない人')).toHaveLength(0);

    const calculation = calculateOrganizerSplit(event);
    if (!calculation.ok) throw new Error('計算に失敗しました');
    expect(calculation.sum).toBe(24000);
  });

  it('50人でも検索が現実的な速さで終わる', () => {
    const event = createEvent('大人数');
    event.weights = { ...DEFAULT_WEIGHTS };
    event.roundingUnit = 100;
    event.totalAmount = 250000;
    event.participants = Array.from({ length: 50 }, (_, index) =>
      createParticipant(`参加者${index}`, 'normal'),
    );

    const start = Date.now();
    for (let count = 0; count < 100; count += 1) {
      event.participants.filter((participant) =>
        matchesParticipantSearch(participant.name, '参加者1'),
      );
    }
    // 1文字打つたびに50人ぶん判定しても十分軽い
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
