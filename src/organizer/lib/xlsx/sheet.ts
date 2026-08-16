import { createZip, decodeText, encodeText, readZip, ZipReadError } from './zip';

/**
 * .xlsx の中身（XML）を組み立て／読み取りする最小実装。
 *
 * 解析は正規表現の一発マッチではなく、開始タグと終了タグを順に走査する。
 * 正規表現で `<row ...>...(\/>|<\/row>)` のように書くと、
 * 行の途中にある空セル `<c r="C1" s="1"/>` の `/>` で行が切れてしまうため。
 * Excelは書式だけ設定された空セルを頻繁に書き出すので、これは実害が出る。
 */

export type CellValue = string | number;

export interface SheetData {
  name: string;
  rows: CellValue[][];
  /** 列幅（文字数）。省略すると既定幅になる。 */
  columnWidths?: number[];
  /** 1行目を見出しとして太字にし、スクロールしても固定する */
  headerRow?: boolean;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

/** Excelが受け付けない制御文字を落とす（XMLとして不正になるため） */
function sanitizeForXml(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** 0 → A, 25 → Z, 26 → AA */
export function columnName(index: number): string {
  let name = '';
  let value = index;
  while (value >= 0) {
    name = String.fromCharCode((value % 26) + 65) + name;
    value = Math.floor(value / 26) - 1;
  }
  return name;
}

/** "B12" → 1（0始まりの列番号） */
export function columnIndex(reference: string): number {
  const letters = reference.toUpperCase().replace(/[^A-Z]/g, '');
  if (letters === '') return -1;
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

/* ------------------------------- 書き出し ------------------------------- */

/** 最小限のスタイル定義。Excelは fills[0]=none / fills[1]=gray125 を前提にしている。 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Yu Gothic"/><family val="2"/></font><font><b/><sz val="11"/><color theme="1"/><name val="Yu Gothic"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function buildSheetXml(sheet: SheetData): string {
  const views = sheet.headerRow
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';

  const cols =
    sheet.columnWidths && sheet.columnWidths.length > 0
      ? `<cols>${sheet.columnWidths
          .map(
            (width, index) =>
              `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
          )
          .join('')}</cols>`
      : '';

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const isHeader = sheet.headerRow === true && rowIndex === 0;
      const styleAttribute = isHeader ? ' s="1"' : '';
      const cells = row
        .map((value, cellIndex) => {
          const reference = `${columnName(cellIndex)}${rowIndex + 1}`;
          if (typeof value === 'number' && Number.isFinite(value)) {
            return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
          }
          const text = sanitizeForXml(String(value ?? ''));
          if (text === '') {
            // 空セルでも見出し行は書式を保つ
            return isHeader ? `<c r="${reference}"${styleAttribute}/>` : '';
          }
          return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

/** シート名にExcelが禁止している文字が入らないようにする */
function safeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31);
  return cleaned === '' ? fallback : cleaned;
}

/** シート一覧から .xlsx の Blob を作る */
export function buildWorkbook(sheets: SheetData[]): Blob {
  const names = sheets.map((sheet, index) => safeSheetName(sheet.name, `Sheet${index + 1}`));

  const sheetEntries = sheets.map((sheet, index) => ({
    path: `xl/worksheets/sheet${index + 1}.xml`,
    data: encodeText(buildSheetXml(sheet)),
  }));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
    .map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')}</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
    .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('')}</sheets></workbook>`;

  // スタイルは最後の rId にまとめる
  const stylesRelationId = sheets.length + 1;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('')}<Relationship Id="rId${stylesRelationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return createZip([
    { path: '[Content_Types].xml', data: encodeText(contentTypes) },
    { path: '_rels/.rels', data: encodeText(rootRels) },
    { path: 'xl/workbook.xml', data: encodeText(workbook) },
    { path: 'xl/_rels/workbook.xml.rels', data: encodeText(workbookRels) },
    { path: 'xl/styles.xml', data: encodeText(STYLES_XML) },
    ...sheetEntries,
  ]);
}

/* ------------------------------- 読み込み ------------------------------- */

interface XmlElement {
  /** 開始タグの属性部分 */
  attributes: string;
  /** 開始タグと終了タグの間（自己終了タグなら空文字） */
  inner: string;
}

/** 属性値の中のクォートを考慮して、開始タグの終わりを探す */
function findTagEnd(xml: string, from: number): { end: number; selfClosing: boolean } | null {
  let quote = '';
  for (let index = from; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote !== '') {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') {
      return { end: index, selfClosing: xml[index - 1] === '/' };
    }
  }
  return null;
}

/**
 * 指定した要素をすべて取り出す。名前空間の接頭辞（x:row など）にも対応する。
 * 同名の入れ子はこのフォーマットでは起きないが、念のため数える。
 */
function findElements(xml: string, tagName: string): XmlElement[] {
  const results: XmlElement[] = [];
  const openPattern = new RegExp(`<(?:[A-Za-z0-9_.\\-]+:)?${tagName}(?=[\\s/>])`, 'g');
  let match: RegExpExecArray | null;

  while ((match = openPattern.exec(xml)) !== null) {
    const tagEnd = findTagEnd(xml, match.index);
    if (!tagEnd) break;

    const attributes = xml.slice(match.index + match[0].length, tagEnd.selfClosing ? tagEnd.end - 1 : tagEnd.end);

    if (tagEnd.selfClosing) {
      results.push({ attributes, inner: '' });
      openPattern.lastIndex = tagEnd.end + 1;
      continue;
    }

    // 対応する終了タグを探す
    const closePattern = new RegExp(`</(?:[A-Za-z0-9_.\\-]+:)?${tagName}\\s*>`, 'g');
    closePattern.lastIndex = tagEnd.end + 1;
    const close = closePattern.exec(xml);
    if (!close) break;

    results.push({ attributes, inner: xml.slice(tagEnd.end + 1, close.index) });
    openPattern.lastIndex = close.index + close[0].length;
  }

  return results;
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attributes);
  if (!match) return null;
  return unescapeXml(match[2] ?? match[3] ?? '');
}

/**
 * <si> や <is> の中の文字を取り出す。
 *
 * 日本語版Excelは漢字を入力すると、ふりがなを <rPh> として一緒に書き込む。
 * これを拾うと「田中部長タナカブチョウ」になってしまうので必ず取り除く。
 */
function extractText(xml: string): string {
  const withoutPhonetic = xml
    .replace(/<(?:[A-Za-z0-9_.\-]+:)?rPh\b[\s\S]*?<\/(?:[A-Za-z0-9_.\-]+:)?rPh\s*>/g, '')
    .replace(/<(?:[A-Za-z0-9_.\-]+:)?phoneticPr\b[^>]*\/?>/g, '');

  return findElements(withoutPhonetic, 't')
    .map((element) => unescapeXml(element.inner))
    .join('');
}

function parseSharedStrings(xml: string): string[] {
  if (xml === '') return [];
  return findElements(xml, 'si').map((element) => extractText(element.inner));
}

/**
 * シートXMLを二次元配列にする。
 * 行・セルは r 属性の位置に置く。Excelは中身が空の行を書き出さないため、
 * 順番に詰めるとエラーメッセージの行番号が実際のExcelとずれてしまう。
 */
function parseSheetXml(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  let nextRowIndex = 0;

  for (const rowElement of findElements(xml, 'row')) {
    const rowReference = attribute(rowElement.attributes, 'r');
    const rowNumber = rowReference !== null ? Number(rowReference) : Number.NaN;
    const rowIndex = Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber - 1 : nextRowIndex;
    nextRowIndex = rowIndex + 1;

    const cells: string[] = [];
    let nextCellIndex = 0;

    for (const cellElement of findElements(rowElement.inner, 'c')) {
      const type = attribute(cellElement.attributes, 't') ?? '';
      const cellReference = attribute(cellElement.attributes, 'r');
      const parsedIndex = cellReference !== null ? columnIndex(cellReference) : -1;
      const cellIndex = parsedIndex >= 0 ? parsedIndex : nextCellIndex;
      nextCellIndex = cellIndex + 1;

      let value = '';
      if (type === 'inlineStr') {
        const inline = findElements(cellElement.inner, 'is')[0];
        value = inline ? extractText(inline.inner) : extractText(cellElement.inner);
      } else if (type === 'e') {
        // エラー値（#REF! など）は空として扱う
        value = '';
      } else {
        // 数式 <f> は決して評価せず、計算済みの値 <v> だけを読む
        const valueElement = findElements(cellElement.inner, 'v')[0];
        const raw = valueElement ? unescapeXml(valueElement.inner) : '';
        if (type === 's') {
          const index = Number(raw);
          value = Number.isInteger(index) && index >= 0 ? (sharedStrings[index] ?? '') : '';
        } else {
          value = raw;
        }
      }

      while (cells.length < cellIndex) cells.push('');
      cells[cellIndex] = value;
    }

    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = cells;
  }

  return rows;
}

export interface ParsedSheet {
  name: string;
  rows: string[][];
}

/**
 * .xlsx を読み込んで、シート名と表データを返す。
 * 中身は必ず文字列として扱う（HTMLや数式として解釈しない）。
 */
export async function readWorkbook(buffer: ArrayBuffer): Promise<ParsedSheet[]> {
  const files = readZip(buffer);

  const workbookXml = decodeText(files.get('xl/workbook.xml'));
  if (workbookXml === '') {
    throw new ZipReadError('Excelファイルとして読み取れませんでした。対応形式は .xlsx です。');
  }

  const relsXml = decodeText(files.get('xl/_rels/workbook.xml.rels'));
  const targetById = new Map<string, string>();
  for (const relation of findElements(relsXml, 'Relationship')) {
    const id = attribute(relation.attributes, 'Id');
    const target = attribute(relation.attributes, 'Target');
    if (id && target) {
      targetById.set(id, target.replace(/^\/?xl\//, '').replace(/^\.\//, ''));
    }
  }

  // sharedStrings.xml の場所も関係定義から引く（別名で置かれることがある）
  let sharedStringsPath = 'xl/sharedStrings.xml';
  for (const relation of findElements(relsXml, 'Relationship')) {
    const type = attribute(relation.attributes, 'Type') ?? '';
    const target = attribute(relation.attributes, 'Target');
    if (type.endsWith('/sharedStrings') && target) {
      sharedStringsPath = `xl/${target.replace(/^\/?xl\//, '').replace(/^\.\//, '')}`;
    }
  }
  const sharedStrings = parseSharedStrings(decodeText(files.get(sharedStringsPath)));

  const sheets: ParsedSheet[] = [];
  const sheetsContainer = findElements(workbookXml, 'sheets')[0];
  const sheetElements = findElements(sheetsContainer ? sheetsContainer.inner : workbookXml, 'sheet');

  sheetElements.forEach((element, index) => {
    const name = attribute(element.attributes, 'name') ?? `Sheet${index + 1}`;
    const relationId =
      attribute(element.attributes, 'r:id') ?? attribute(element.attributes, 'id') ?? '';
    const target = targetById.get(relationId);
    const path = target ? `xl/${target}` : `xl/worksheets/sheet${index + 1}.xml`;
    const sheetXml = decodeText(files.get(path));
    if (sheetXml === '') return;
    sheets.push({ name, rows: parseSheetXml(sheetXml, sharedStrings) });
  });

  if (sheets.length === 0) {
    throw new ZipReadError('シートが見つかりませんでした。');
  }
  return sheets;
}

export { ZipReadError };
