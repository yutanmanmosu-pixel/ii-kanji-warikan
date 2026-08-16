import { describe, expect, it } from 'vitest';
import { parseRosterRows } from './excel';

describe('parseRosterRows', () => {
  const header = ['名前', '負担レベル', '出欠', 'メモ'];

  it('8. 正しい負担レベルは読み込める', () => {
    const result = parseRosterRows([
      header,
      ['田中部長', '多め', '参加', 'よろしくお願いします'],
      ['山田課長', 'ちょい多め', '', ''],
      ['佐藤', 'ふつう', '欠席', ''],
      ['鈴木', 'ちょい少なめ', '', ''],
      ['高橋', '少なめ', '', ''],
    ]);

    expect(result.fatal).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.participants.map((p) => p.level)).toEqual([
      'more',
      'slightlyMore',
      'normal',
      'slightlyLess',
      'less',
    ]);
    expect(result.participants[0].memo).toBe('よろしくお願いします');
    expect(result.participants[2].attendance).toBe('absent');
    // 出欠が空欄なら参加として扱う
    expect(result.participants[1].attendance).toBe('attending');
  });

  it('8-2. 不正な負担レベルは行番号つきのエラーになる', () => {
    const result = parseRosterRows([header, ['田中', 'すごく多め', '', ''], ['佐藤', 'ふつう', '', '']]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain('すごく多め');
    // エラー行は取り込まず、正常な行だけ残す
    expect(result.participants.map((p) => p.name)).toEqual(['佐藤']);
  });

  it('8-3. 不正な出欠もエラーになる', () => {
    const result = parseRosterRows([header, ['田中', 'ふつう', '未定', '']]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('未定');
    expect(result.participants).toHaveLength(0);
  });

  it('空行は無視し、名前が空の行はエラーにする', () => {
    const result = parseRosterRows([
      header,
      ['', '', '', ''],
      ['田中', 'ふつう', '', ''],
      ['', 'ふつう', '', ''],
    ]);
    expect(result.participants).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(4);
  });

  it('負担レベルが空欄なら「ふつう」になる', () => {
    const result = parseRosterRows([header, ['田中', '', '', '']]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].level).toBe('normal');
  });

  it('9-3. 同姓同名も別のIDで読み込める', () => {
    const result = parseRosterRows([header, ['鈴木', 'ふつう', '', ''], ['鈴木', '多め', '', '']]);
    expect(result.participants).toHaveLength(2);
    expect(result.participants[0].id).not.toBe(result.participants[1].id);
  });

  it('前後の空白や全角スペースを取り除く', () => {
    const result = parseRosterRows([header, ['  田中部長　', ' 多め ', ' 参加 ', ' メモ ']]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].name).toBe('田中部長');
    expect(result.participants[0].level).toBe('more');
  });

  it('見出しが見つからないファイルは全体エラーにする', () => {
    const result = parseRosterRows([['番号', '区分'], ['1', 'A']]);
    expect(result.fatal).not.toBeNull();
    expect(result.participants).toHaveLength(0);
  });

  it('「氏名」「レベル」などの言い換えも見出しとして認識する', () => {
    const result = parseRosterRows([['氏名', 'レベル', '備考'], ['田中', '多め', '幹事']]);
    expect(result.fatal).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].name).toBe('田中');
    expect(result.participants[0].level).toBe('more');
    expect(result.participants[0].memo).toBe('幹事');
  });

  it('見出しより上に行があっても読み込める', () => {
    const result = parseRosterRows([['この行は説明'], [], header, ['田中', 'ふつう', '', '']]);
    expect(result.fatal).toBeNull();
    expect(result.participants).toHaveLength(1);
  });

  it('列の順番が入れ替わっていても見出しで判断する', () => {
    const result = parseRosterRows([
      ['メモ', '名前', '負担レベル'],
      ['車で来ている', '佐藤', '少なめ'],
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].name).toBe('佐藤');
    expect(result.participants[0].level).toBe('less');
    expect(result.participants[0].memo).toBe('車で来ている');
  });
});

/**
 * 固定額対応の新形式と、これまでの旧形式の両方が読めることの確認。
 */
describe('Excel 新形式（徴収方法・固定額）', () => {
  const newHeader = ['名前', '徴収方法', '負担レベル', '固定額', '出欠', 'メモ'];

  it('旧形式（名前 / 負担レベル / 出欠 / メモ）は今までどおり全員5段階で読める', () => {
    const result = parseRosterRows([
      ['名前', '負担レベル', '出欠', 'メモ'],
      ['田中部長', '多め', '参加', '幹事'],
      ['佐藤さん', 'ふつう', '', ''],
    ]);

    expect(result.fatal).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.participants.map((p) => p.chargeMode)).toEqual(['weighted', 'weighted']);
    expect(result.participants.map((p) => p.fixedAmount)).toEqual([null, null]);
    expect(result.participants[0].level).toBe('more');
  });

  it('新形式の5段階を読める', () => {
    const result = parseRosterRows([newHeader, ['山田課長', '5段階', '多め', '', '参加', '']]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].chargeMode).toBe('weighted');
    expect(result.participants[0].level).toBe('more');
  });

  it('新形式の固定額を読める', () => {
    const result = parseRosterRows([newHeader, ['田中部長', '固定額', '', '10000', '参加', '']]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].chargeMode).toBe('fixed');
    expect(result.participants[0].fixedAmount).toBe(10000);
    // 負担レベルは既定の「ふつう」を持たせておく（5段階へ戻したときのため）
    expect(result.participants[0].level).toBe('normal');
  });

  it('固定額0円は正常に読める', () => {
    const result = parseRosterRows([newHeader, ['新入社員', '固定額', '', '0', '参加', '今回は無料']]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].fixedAmount).toBe(0);
  });

  it('カンマや「円」が付いた固定額も読める', () => {
    const result = parseRosterRows([
      newHeader,
      ['A', '固定額', '', '10,000', '参加', ''],
      ['B', '固定額', '', '3000円', '参加', ''],
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants.map((p) => p.fixedAmount)).toEqual([10000, 3000]);
  });

  it('徴収方法が「固定額」なのに金額が空なら行番号つきでエラー', () => {
    const result = parseRosterRows([
      newHeader,
      ['田中', '固定額', '', '', '参加', ''],
      ['佐藤', '5段階', 'ふつう', '', '参加', ''],
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain('固定額が入力されていません');
    // エラー行は取り込まず、正常な行だけ残す
    expect(result.participants.map((p) => p.name)).toEqual(['佐藤']);
  });

  it('負の値・小数・数字でない固定額はエラーになる', () => {
    const result = parseRosterRows([
      newHeader,
      ['A', '固定額', '', '-500', '参加', ''],
      ['B', '固定額', '', '1234.5', '参加', ''],
      ['C', '固定額', '', 'たくさん', '参加', ''],
    ]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(result.errors[0].message).toContain('マイナス');
    expect(result.errors[1].message).toContain('小数');
    expect(result.participants).toHaveLength(0);
  });

  it('徴収方法の表記ゆれ（固定 / fixed / 傾斜 / weighted）を受け入れる', () => {
    const result = parseRosterRows([
      newHeader,
      ['A', '固定', '', '5000', '参加', ''],
      ['B', 'fixed', '', '6000', '参加', ''],
      ['C', '傾斜', 'ふつう', '', '参加', ''],
      ['D', 'weighted', '少なめ', '', '参加', ''],
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants.map((p) => p.chargeMode)).toEqual([
      'fixed',
      'fixed',
      'weighted',
      'weighted',
    ]);
  });

  it('徴収方法に知らない言葉が入っていたらエラーになる', () => {
    const result = parseRosterRows([newHeader, ['A', 'おごり', '', '', '参加', '']]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('おごり');
  });

  it('徴収方法が空欄なら5段階として扱う', () => {
    const result = parseRosterRows([newHeader, ['A', '', 'ふつう', '', '参加', '']]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].chargeMode).toBe('weighted');
  });

  it('徴収方法列がなく固定額列だけある場合は、金額のある行を固定額と判断する', () => {
    const result = parseRosterRows([
      ['名前', '負担レベル', '固定額'],
      ['田中', '', '10000'],
      ['佐藤', 'ふつう', ''],
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].chargeMode).toBe('fixed');
    expect(result.participants[0].fixedAmount).toBe(10000);
    expect(result.participants[1].chargeMode).toBe('weighted');
  });

  it('5段階の行に固定額が書いてあっても、5段階のまま扱う', () => {
    const result = parseRosterRows([newHeader, ['A', '5段階', '多め', '9999', '参加', '']]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].chargeMode).toBe('weighted');
    expect(result.participants[0].level).toBe('more');
    // 値は覚えておくが計算には使わない
    expect(result.participants[0].fixedAmount).toBe(9999);
  });

  it('列の順番が入れ替わっていても見出しで判断する', () => {
    const result = parseRosterRows([
      ['固定額', 'メモ', '名前', '徴収方法', '負担レベル'],
      ['12000', '部長', '田中', '固定額', ''],
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].name).toBe('田中');
    expect(result.participants[0].chargeMode).toBe('fixed');
    expect(result.participants[0].fixedAmount).toBe(12000);
    expect(result.participants[0].memo).toBe('部長');
  });
});
