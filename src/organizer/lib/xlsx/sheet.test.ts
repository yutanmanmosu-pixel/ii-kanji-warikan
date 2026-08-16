import { describe, expect, it } from 'vitest';
import { buildWorkbook, columnIndex, columnName, readWorkbook } from './sheet';
import { buildRosterTemplate } from '../excel';
import { parseRosterRows } from '../excel';

/**
 * 自前のxlsx実装が「書いたものを読み戻せる」ことを確認する。
 * 無圧縮(store)で書き出しているため、この確認は展開機能なしでも通る。
 */
describe('xlsx', () => {
  it('列名と列番号を相互に変換できる', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AA100')).toBe(26);
  });

  it('書き出したブックを読み戻せる', async () => {
    const blob = buildWorkbook([
      {
        name: 'テスト',
        rows: [
          ['名前', '金額'],
          ['田中 & 佐藤 <重要>', 8000],
          ['鈴木', 0],
        ],
      },
      { name: '2枚目', rows: [['あ', 'い']] },
    ]);

    const sheets = await readWorkbook(await blob.arrayBuffer());
    expect(sheets).toHaveLength(2);
    expect(sheets[0].name).toBe('テスト');
    expect(sheets[1].name).toBe('2枚目');
    // XMLの特殊文字が壊れずに往復する
    expect(sheets[0].rows[1][0]).toBe('田中 & 佐藤 <重要>');
    expect(sheets[0].rows[1][1]).toBe('8000');
    expect(sheets[0].rows[2][0]).toBe('鈴木');
  });

  // テンプレートは固定額対応で「徴収方法」「固定額」列が増え、
  // 固定額のサンプル行（田中部長・新入社員）を含む5行になった。
  it('名簿テンプレートは、そのまま読み込める形式になっている', async () => {
    const sheets = await readWorkbook(await buildRosterTemplate().arrayBuffer());
    const roster = sheets.find((sheet) => sheet.name === '名簿');
    expect(roster).toBeDefined();

    const result = parseRosterRows(roster!.rows);
    expect(result.fatal).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.participants).toHaveLength(5);
    expect(result.participants[0].name).toBe('田中部長');
    expect(result.participants[0].chargeMode).toBe('fixed');
    expect(result.participants[0].fixedAmount).toBe(10000);
    expect(result.participants[3].name).toBe('鈴木さん');
    expect(result.participants[3].level).toBe('less');
  });

  it('Excelファイルでないデータは分かりやすいエラーになる', async () => {
    const garbage = new TextEncoder().encode('これはExcelではありません');
    await expect(readWorkbook(garbage.buffer as ArrayBuffer)).rejects.toThrow();
  });

  it('空のデータでもクラッシュせずエラーになる', async () => {
    await expect(readWorkbook(new ArrayBuffer(0))).rejects.toThrow();
  });
});
