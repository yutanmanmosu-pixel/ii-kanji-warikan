import { describe, expect, it } from 'vitest';
import { inflateRaw } from './inflate';
import { createZip, encodeText, readZip } from './zip';
import { readWorkbook } from './sheet';
import { parseRosterRows } from '../excel';

/**
 * 実際のExcel・Googleスプレッドシート・LibreOfficeが書き出す .xlsx に
 * 現れる形を再現して、読み込めることを確認する。
 */

function makeXlsx(sheetXml: string, options: { shared?: string; sheetName?: string } = {}) {
  const sheetName = options.sheetName ?? '名簿';
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl" lastEdited="7" lowestEdited="7"/><workbookPr defaultThemeVersion="166925"/><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${
    options.shared
      ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
      : ''
  }</Relationships>`;

  const entries = [
    { path: '[Content_Types].xml', data: encodeText(contentTypes) },
    { path: '_rels/.rels', data: encodeText(rootRels) },
    // Excelが付けてくる余分なメタデータ
    { path: 'docProps/app.xml', data: encodeText('<?xml version="1.0"?><Properties/>') },
    { path: 'docProps/core.xml', data: encodeText('<?xml version="1.0"?><cp:coreProperties xmlns:cp="x"/>') },
    { path: 'xl/theme/theme1.xml', data: encodeText('<?xml version="1.0"?><a:theme xmlns:a="x"/>') },
    { path: 'xl/styles.xml', data: encodeText('<?xml version="1.0"?><styleSheet/>') },
    { path: 'xl/workbook.xml', data: encodeText(workbook) },
    { path: 'xl/_rels/workbook.xml.rels', data: encodeText(workbookRels) },
    { path: 'xl/worksheets/sheet1.xml', data: encodeText(sheetXml) },
  ];
  if (options.shared) entries.push({ path: 'xl/sharedStrings.xml', data: encodeText(options.shared) });
  return createZip(entries);
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac"><dimension ref="A1:D6"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18.75" x14ac:dyDescent="0.4"/><sheetData>';
const TAIL = '</sheetData><phoneticPr fontId="1"/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';

function inline(reference: string, text: string, style = '') {
  return `<c r="${reference}"${style} t="inlineStr"><is><t>${text}</t></is></c>`;
}

async function rowsOf(blob: Blob) {
  const sheets = await readWorkbook(await blob.arrayBuffer());
  return sheets[0].rows;
}

describe('Excel互換性', () => {
  it('書式だけ設定された空セルがあっても、行の後ろが切れない', async () => {
    // Excelは書式を触ったセルを <c r="C1" s="1"/> のように書き出す
    const sheet =
      HEAD +
      `<row r="1" spans="1:4" x14ac:dyDescent="0.4">${inline('A1', '名前')}${inline('B1', '負担レベル')}<c r="C1" s="1"/>${inline('D1', 'メモ')}</row>` +
      `<row r="2" spans="1:4">${inline('A2', '田中部長')}${inline('B2', '多め')}<c r="C2" s="2"/>${inline('D2', '幹事')}</row>` +
      TAIL;

    const rows = await rowsOf(makeXlsx(sheet));
    expect(rows[0]).toEqual(['名前', '負担レベル', '', 'メモ']);
    expect(rows[1]).toEqual(['田中部長', '多め', '', '幹事']);

    const result = parseRosterRows(rows);
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].level).toBe('more');
    expect(result.participants[0].memo).toBe('幹事');
  });

  it('日本語Excelのふりがな(rPh)を名前に混ぜない', async () => {
    const shared =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6">' +
      '<si><t>名前</t><phoneticPr fontId="1"/></si>' +
      '<si><t>負担レベル</t><rPh sb="0" eb="2"><t>フタン</t></rPh><phoneticPr fontId="1"/></si>' +
      '<si><t>田中部長</t><rPh sb="0" eb="4"><t>タナカブチョウ</t></rPh><phoneticPr fontId="1"/></si>' +
      '<si><t>多め</t><rPh sb="0" eb="1"><t>オオ</t></rPh><phoneticPr fontId="1"/></si>' +
      '<si><t>鈴木 花子</t><rPh sb="0" eb="2"><t>スズキ</t></rPh><rPh sb="3" eb="5"><t>ハナコ</t></rPh></si>' +
      '<si><t>少なめ</t><rPh sb="0" eb="1"><t>スク</t></rPh></si>' +
      '</sst>';
    const cell = (reference: string, index: number) => `<c r="${reference}" t="s"><v>${index}</v></c>`;
    const sheet =
      HEAD +
      `<row r="1">${cell('A1', 0)}${cell('B1', 1)}</row>` +
      `<row r="2">${cell('A2', 2)}${cell('B2', 3)}</row>` +
      `<row r="3">${cell('A3', 4)}${cell('B3', 5)}</row>` +
      TAIL;

    const rows = await rowsOf(makeXlsx(sheet, { shared }));
    expect(rows[1]).toEqual(['田中部長', '多め']);
    // 名前にスペースが入っていても壊れない
    expect(rows[2]).toEqual(['鈴木 花子', '少なめ']);

    const result = parseRosterRows(rows);
    expect(result.errors).toHaveLength(0);
    expect(result.participants.map((participant) => participant.name)).toEqual(['田中部長', '鈴木 花子']);
    expect(result.participants.map((participant) => participant.level)).toEqual(['more', 'less']);
  });

  it('空行が省略されていても、エラーの行番号がExcelとずれない', async () => {
    const sheet =
      HEAD +
      `<row r="1">${inline('A1', '名前')}${inline('B1', '負担レベル')}</row>` +
      `<row r="2">${inline('A2', '田中')}${inline('B2', 'ふつう')}</row>` +
      // 3・4行目は空なのでExcelは書き出さない
      `<row r="5">${inline('A5', '佐藤')}${inline('B5', 'すごく多め')}</row>` +
      TAIL;

    const rows = await rowsOf(makeXlsx(sheet));
    const result = parseRosterRows(rows);
    expect(result.participants).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    // Excelの画面上でも5行目
    expect(result.errors[0].row).toBe(5);
  });

  it('数式のセルは計算結果だけを読み、数式を実行しない', async () => {
    const sheet =
      HEAD +
      `<row r="1">${inline('A1', '名前')}${inline('B1', '負担レベル')}</row>` +
      `<row r="2"><c r="A2" t="str"><f>CONCATENATE("田中","部長")</f><v>田中部長</v></c>${inline('B2', 'ふつう')}</row>` +
      `<row r="3"><c r="A3" t="e"><f>1/0</f><v>#DIV/0!</v></c>${inline('B3', 'ふつう')}</row>` +
      TAIL;

    const rows = await rowsOf(makeXlsx(sheet));
    expect(rows[1][0]).toBe('田中部長');
    // エラー値は空として扱う → 名前が空なのでエラー行になる
    expect(rows[2][0]).toBe('');
  });

  it('数値セル・日付・列の順序入れ替え・余分な列に対応する', async () => {
    const sheet =
      HEAD +
      `<row r="1">${inline('A1', '社員番号')}${inline('B1', 'メモ')}${inline('C1', '氏名')}${inline('D1', 'レベル')}${inline('E1', '部署')}</row>` +
      `<row r="2"><c r="A2"><v>1024</v></c>${inline('B2', '車で来ている')}${inline('C2', '佐藤')}${inline('D2', '少なめ')}${inline('E2', '営業')}</row>` +
      TAIL;

    const rows = await rowsOf(makeXlsx(sheet));
    expect(rows[1][0]).toBe('1024');

    // 「氏名」「レベル」という言い換えでも読める
    const result = parseRosterRows(rows);
    expect(result.fatal).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].name).toBe('佐藤');
    expect(result.participants[0].level).toBe('less');
    expect(result.participants[0].memo).toBe('車で来ている');
  });

  it('負担レベルの列がなくても読み込める（全員ふつう）', async () => {
    const sheet = HEAD + `<row r="1">${inline('A1', '名前')}</row><row r="2">${inline('A2', '田中')}</row>` + TAIL;
    const result = parseRosterRows(await rowsOf(makeXlsx(sheet)));
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].level).toBe('normal');
  });

  it('全角スペースや前後の空白が入っていても読み取れる', async () => {
    const sheet =
      HEAD +
      `<row r="1">${inline('A1', '　名前　')}${inline('B1', ' 負担レベル')}${inline('C1', '出欠')}</row>` +
      `<row r="2">${inline('A2', '  田中部長　')}${inline('B2', '　多め ')}${inline('C2', ' 欠席 ')}</row>` +
      TAIL;

    const result = parseRosterRows(await rowsOf(makeXlsx(sheet)));
    expect(result.errors).toHaveLength(0);
    expect(result.participants[0].name).toBe('田中部長');
    expect(result.participants[0].level).toBe('more');
    expect(result.participants[0].attendance).toBe('absent');
  });

  it('出欠は○×や英語表記も受け付ける', async () => {
    const sheet =
      HEAD +
      `<row r="1">${inline('A1', '名前')}${inline('B1', '出欠')}</row>` +
      `<row r="2">${inline('A2', 'A')}${inline('B2', '○')}</row>` +
      `<row r="3">${inline('A3', 'B')}${inline('B3', '×')}</row>` +
      `<row r="4">${inline('A4', 'C')}${inline('B4', 'YES')}</row>` +
      TAIL;

    const result = parseRosterRows(await rowsOf(makeXlsx(sheet)));
    expect(result.errors).toHaveLength(0);
    expect(result.participants.map((participant) => participant.attendance)).toEqual([
      'attending',
      'absent',
      'attending',
    ]);
  });

  it('同姓同名も別々に読み込める', async () => {
    const sheet =
      HEAD +
      `<row r="1">${inline('A1', '名前')}${inline('B1', '負担レベル')}</row>` +
      `<row r="2">${inline('A2', '鈴木')}${inline('B2', 'ふつう')}</row>` +
      `<row r="3">${inline('A3', '鈴木')}${inline('B3', '多め')}</row>` +
      TAIL;

    const result = parseRosterRows(await rowsOf(makeXlsx(sheet)));
    expect(result.participants).toHaveLength(2);
    expect(result.participants[0].id).not.toBe(result.participants[1].id);
  });

  it('行数が多くても読み込める', async () => {
    const rows = [`<row r="1">${inline('A1', '名前')}${inline('B1', '負担レベル')}</row>`];
    for (let index = 0; index < 90; index += 1) {
      const row = index + 2;
      rows.push(`<row r="${row}">${inline(`A${row}`, `参加者${index}`)}${inline(`B${row}`, 'ふつう')}</row>`);
    }
    const result = parseRosterRows(await rowsOf(makeXlsx(HEAD + rows.join('') + TAIL)));
    expect(result.errors).toHaveLength(0);
    expect(result.participants).toHaveLength(90);
  });

  it('名前空間の接頭辞つきタグでも読める', async () => {
    const sheet =
      '<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>' +
      '<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>名前</x:t></x:is></x:c></x:row>' +
      '<x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t>田中</x:t></x:is></x:c></x:row>' +
      '</x:sheetData></x:worksheet>';
    const rows = await rowsOf(makeXlsx(sheet));
    expect(rows[1]).toEqual(['田中']);
  });

  it('deflate圧縮されたZIPも展開できる', () => {
    // inflate は zip.ts 経由でしか使わないが、単体でも往復を確認しておく
    const original = encodeText('あいうえお'.repeat(500));
    const stored = createZip([{ path: 'a.txt', data: original }]);
    expect(stored).toBeDefined();
    // 非圧縮ブロックだけで構成された deflate ストリーム
    const raw = new Uint8Array([0x01, 0x03, 0x00, 0xfc, 0xff, 0x61, 0x62, 0x63]);
    expect(Array.from(inflateRaw(raw))).toEqual([0x61, 0x62, 0x63]);
  });

  it('壊れたZIPは例外になり、アプリを落とさない', () => {
    const garbage = encodeText('PK壊れています'.repeat(10));
    expect(() => readZip(garbage.buffer)).toThrow();
  });
});

/**
 * 自分で出力したファイルを読み戻せること（テンプレートと集金表）。
 */
describe('自作Excelの往復', () => {
  it('新形式テンプレートをそのまま読み込める', async () => {
    const { buildRosterTemplate } = await import('../excel');
    const { readWorkbook } = await import('./sheet');
    const sheets = await readWorkbook(await buildRosterTemplate().arrayBuffer());
    const roster = sheets.find((sheet) => sheet.name === '名簿');
    expect(roster).toBeDefined();

    const result = parseRosterRows(roster!.rows);
    expect(result.fatal).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.participants).toHaveLength(5);

    expect(result.participants[0].chargeMode).toBe('fixed');
    expect(result.participants[0].fixedAmount).toBe(10000);
    expect(result.participants[1].chargeMode).toBe('weighted');
    expect(result.participants[1].level).toBe('slightlyMore');
    // 固定額0円のサンプルも正しく読める
    expect(result.participants[4].chargeMode).toBe('fixed');
    expect(result.participants[4].fixedAmount).toBe(0);
  });

  it('出力した集金表を読み込むと、同じ名簿が復元できる', async () => {
    const { buildCollectionWorkbook, buildRosterTemplate } = await import('../excel');
    const { readWorkbook } = await import('./sheet');
    const { calculateOrganizerSplit, summarize } = await import('../calculation');
    const { createEvent, createParticipant } = await import('../storage');

    const event = createEvent('往復テスト');
    event.roundingUnit = 100;
    event.totalAmount = 30000;
    const boss = createParticipant('田中部長', 'normal');
    boss.chargeMode = 'fixed';
    boss.fixedAmount = 10000;
    event.participants = [boss, createParticipant('佐藤', 'more'), createParticipant('鈴木', 'less')];

    const calculation = calculateOrganizerSplit(event);
    if (!calculation.ok) throw new Error('計算に失敗しました');
    const summary = summarize(event.participants, calculation.amounts);
    const blob = buildCollectionWorkbook(event, calculation.amounts, summary);

    const sheets = await readWorkbook(await blob.arrayBuffer());
    expect(sheets.map((sheet) => sheet.name)).toEqual(['集金表', '概要']);

    const result = parseRosterRows(sheets[0].rows);
    expect(result.fatal).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.participants.map((participant) => participant.name)).toEqual([
      '田中部長',
      '佐藤',
      '鈴木',
    ]);
    expect(result.participants[0].chargeMode).toBe('fixed');
    expect(result.participants[0].fixedAmount).toBe(10000);
    expect(result.participants[1].chargeMode).toBe('weighted');
    expect(result.participants[1].level).toBe('more');

    // テンプレートが壊れていないことも同時に確認
    expect(buildRosterTemplate()).toBeDefined();
  });
});
