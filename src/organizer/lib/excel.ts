import { LEVELS, LEVEL_LABELS, LEVEL_ORDER } from '../../constants/split';
import type { LevelId } from '../../types/split';
import type { ChargeMode } from '../types';
import type { OrganizerEvent, OrganizerParticipant } from '../types';
import { collectionOf, type OrganizerSummary } from './calculation';
import { createParticipant, MAX_PARTICIPANTS } from './storage';
import { buildWorkbook, readWorkbook, ZipReadError, type SheetData } from './xlsx/sheet';

/**
 * Excel（.xlsx）の入出力。UIからは呼ぶだけで済むよう、ここに閉じ込める。
 */

export const ROSTER_SHEET_NAME = '名簿';
export const RULES_SHEET_NAME = '入力ルール';
export const COLLECTION_SHEET_NAME = '集金表';
export const OVERVIEW_SHEET_NAME = '概要';

const HEADER_NAME = '名前';
const HEADER_CHARGE = '徴収方法';
const HEADER_LEVEL = '負担レベル';
const HEADER_FIXED = '固定額';
const HEADER_ATTENDANCE = '出欠';
const HEADER_MEMO = 'メモ';

const CHARGE_WEIGHTED_LABEL = '5段階';
const CHARGE_FIXED_LABEL = '固定額';

const ATTENDING_LABEL = '参加';
const ABSENT_LABEL = '欠席';

/** 手作りの名簿でも読めるよう、見出しの言い換えを許容する */
const NAME_ALIASES = ['名前', '氏名', 'なまえ', '参加者', '参加者名'];
const LEVEL_ALIASES = ['負担レベル', 'レベル', '負担', '負担度'];
const ATTENDANCE_ALIASES = ['出欠', '出席', '参加状況'];
const MEMO_ALIASES = ['メモ', '備考', 'コメント'];
const CHARGE_ALIASES = ['徴収方法', '徴収方式', '方式', '区分'];
const FIXED_ALIASES = ['固定額', '固定金額', '定額'];

/** 「徴収方法」列に書ける言葉。表記の揺れは限定的に受け入れる。 */
const CHARGE_BY_LABEL = new Map<string, ChargeMode>([
  ['5段階', 'weighted'],
  ['５段階', 'weighted'],
  ['5だんかい', 'weighted'],
  ['傾斜', 'weighted'],
  ['weighted', 'weighted'],
  ['固定額', 'fixed'],
  ['固定金額', 'fixed'],
  ['固定', 'fixed'],
  ['fixed', 'fixed'],
]);

const LEVEL_BY_LABEL = new Map<string, LevelId>(LEVELS.map((level) => [level.label, level.id]));
const ATTENDING_WORDS = new Set(['参加', '出席', '○', '〇', 'o', 'yes', 'true', '1']);
const ABSENT_WORDS = new Set(['欠席', '不参加', '×', 'x', 'no', 'false', '0']);

/**
 * 比較用に文字を整える。
 * 全角スペース・改行・ノーブレークスペースを落とし、全角英数字を半角にする。
 * Excelの表示上は同じに見えても内部の文字が違うことがあるため。
 */
function normalize(text: string): string {
  return text
    .replace(/[\u3000\u00a0]/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 見出しの照合用。空白をすべて取り除き、小文字に揃える。 */
function normalizeHeader(text: string): string {
  return normalize(text).replace(/\s/g, '').toLowerCase();
}

/* --------------------------- テンプレート出力 --------------------------- */

export function buildRosterTemplate(): Blob {
  const roster: SheetData = {
    name: ROSTER_SHEET_NAME,
    columnWidths: [18, 12, 14, 12, 8, 28],
    headerRow: true,
    rows: [
      [HEADER_NAME, HEADER_CHARGE, HEADER_LEVEL, HEADER_FIXED, HEADER_ATTENDANCE, HEADER_MEMO],
      ['田中部長', CHARGE_FIXED_LABEL, '', 10000, ATTENDING_LABEL, 'ごちそうさまです'],
      ['山田課長', CHARGE_WEIGHTED_LABEL, 'ちょい多め', '', ATTENDING_LABEL, ''],
      ['佐藤さん', CHARGE_WEIGHTED_LABEL, 'ふつう', '', ATTENDING_LABEL, ''],
      ['鈴木さん', CHARGE_WEIGHTED_LABEL, '少なめ', '', ATTENDING_LABEL, '新入社員'],
      ['新入社員', CHARGE_FIXED_LABEL, '', 0, ATTENDING_LABEL, '今回は無料'],
    ],
  };

  const rules: SheetData = {
    name: RULES_SHEET_NAME,
    columnWidths: [20, 56],
    headerRow: true,
    rows: [
      ['項目', '入力できる内容'],
      [HEADER_NAME, '参加者の名前。必須。同じ名前が複数あっても登録できます。'],
      [
        HEADER_CHARGE,
        `${CHARGE_WEIGHTED_LABEL} / ${CHARGE_FIXED_LABEL}（空欄なら「${CHARGE_WEIGHTED_LABEL}」になります）`,
      ],
      [HEADER_LEVEL, `${LEVEL_ORDER.map((level) => LEVEL_LABELS[level]).join(' / ')}（${CHARGE_WEIGHTED_LABEL}のときだけ使います）`],
      [
        HEADER_FIXED,
        `半角数字で金額を入れます（${CHARGE_FIXED_LABEL}のときだけ使います）。0円も設定できます。`,
      ],
      [HEADER_ATTENDANCE, `${ATTENDING_LABEL} / ${ABSENT_LABEL}（空欄なら「${ATTENDING_LABEL}」になります）`],
      [HEADER_MEMO, '自由記入。空欄でも構いません。'],
      ['', ''],
      ['使い方', `「${ROSTER_SHEET_NAME}」シートの2行目以降を書き換えて保存し、幹事モードで読み込んでください。`],
      ['注意', '1行目の見出しは変更しないでください。サンプルの4人は消してから使ってください。'],
      ['注意', `${HEADER_LEVEL}が上の一覧にない言葉だと、その行はエラーとして表示されます。`],
      ['注意', '保存形式は .xlsx にしてください（.xls や .xlsm は読み込めません）。'],
      ['注意', '列の順番は入れ替えても構いません。見出しの文字で判断します。'],
      ['注意', `${HEADER_CHARGE}列がないファイルは、全員${CHARGE_WEIGHTED_LABEL}として読み込みます。`],
      ['注意', `${CHARGE_FIXED_LABEL}の人は、先に固定額を差し引いてから残りを${CHARGE_WEIGHTED_LABEL}の人で分けます。`],
    ],
  };

  return buildWorkbook([roster, rules]);
}

/* ------------------------------ 読み込み ------------------------------ */

export interface ImportRowError {
  /** Excel上の行番号（1始まり・見出し行を含む） */
  row: number;
  message: string;
}

export interface ImportResult {
  participants: OrganizerParticipant[];
  errors: ImportRowError[];
  /** 見出し行が見つからないなど、ファイル全体の問題 */
  fatal: string | null;
  /** 実際に読み取ったシート名（どのシートを見たか案内するため） */
  sheetName: string | null;
}

function findColumn(cells: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = cells.indexOf(normalizeHeader(alias));
    if (index !== -1) return index;
  }
  return -1;
}

interface HeaderInfo {
  index: number;
  name: number;
  charge: number;
  level: number;
  fixed: number;
  attendance: number;
  memo: number;
}

/** 上から20行までを見て、見出し行を探す（説明文が上に入っていても読める） */
function findHeader(rows: string[][]): HeaderInfo | null {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const cells = (rows[index] ?? []).map(normalizeHeader);
    const name = findColumn(cells, NAME_ALIASES);
    if (name === -1) continue;
    return {
      index,
      name,
      charge: findColumn(cells, CHARGE_ALIASES),
      // 「固定額」を先に探してから「負担レベル」を探すと列を取り違えないので、
      // それぞれ専用の別名一覧で判定する
      level: findColumn(cells, LEVEL_ALIASES),
      fixed: findColumn(cells, FIXED_ALIASES),
      attendance: findColumn(cells, ATTENDANCE_ALIASES),
      memo: findColumn(cells, MEMO_ALIASES),
    };
  }
  return null;
}

function cellAt(cells: string[], column: number): string {
  return column >= 0 ? normalize(cells[column] ?? '') : '';
}

/**
 * 読み込んだ表を参加者一覧に変換する。
 * エラーがあった行は取り込まず、行番号つきで返す。
 * 呼び出し側は内容を確認してから名簿へ反映する（いきなり置き換えない）。
 */
export function parseRosterRows(rows: string[][]): ImportResult {
  const header = findHeader(rows);
  if (!header) {
    return {
      participants: [],
      errors: [],
      sheetName: null,
      fatal: `「${HEADER_NAME}」の見出しが見つかりませんでした。テンプレートの形式でご用意ください。`,
    };
  }

  const participants: OrganizerParticipant[] = [];
  const errors: ImportRowError[] = [];
  const levelLabels = LEVEL_ORDER.map((id) => LEVEL_LABELS[id]).join('・');

  for (let index = header.index + 1; index < rows.length; index += 1) {
    const cells = rows[index] ?? [];
    const rowNumber = index + 1;

    const name = cellAt(cells, header.name);
    const chargeText = cellAt(cells, header.charge);
    const levelText = cellAt(cells, header.level);
    const fixedText = cellAt(cells, header.fixed);
    const attendanceText = cellAt(cells, header.attendance);
    const memo = cellAt(cells, header.memo);

    // 空行は読み飛ばす（見出しの下にある空白行や、書式だけ残った行）
    if (
      name === '' &&
      chargeText === '' &&
      levelText === '' &&
      fixedText === '' &&
      attendanceText === '' &&
      memo === ''
    ) {
      continue;
    }

    if (name === '') {
      errors.push({ row: rowNumber, message: `${HEADER_NAME}が空です。` });
      continue;
    }

    /*
     * 徴収方法の決め方
     *  - 「徴収方法」列がある → その値に従う（空欄なら5段階）
     *  - 列がない（旧形式）  → 全員5段階。ただし「固定額」列に値があればその行だけ固定額と判断する。
     *    固定額列をわざわざ用意しているのは固定額を使う意図とみなせるため。
     */
    let chargeMode: ChargeMode = 'weighted';
    if (header.charge >= 0 && chargeText !== '') {
      const matched = CHARGE_BY_LABEL.get(chargeText.toLowerCase());
      if (!matched) {
        errors.push({
          row: rowNumber,
          message: `${HEADER_CHARGE}「${chargeText}」は使えません。${CHARGE_WEIGHTED_LABEL}または${CHARGE_FIXED_LABEL}にしてください。`,
        });
        continue;
      }
      chargeMode = matched;
    } else if (header.charge === -1 && header.fixed >= 0 && fixedText !== '') {
      chargeMode = 'fixed';
    }

    let level: LevelId = 'normal';
    let fixedAmount: number | null = null;

    if (chargeMode === 'fixed') {
      if (fixedText === '') {
        errors.push({
          row: rowNumber,
          message: `${HEADER_CHARGE}が「${CHARGE_FIXED_LABEL}」ですが、${HEADER_FIXED}が入力されていません。`,
        });
        continue;
      }
      // カンマや「円」が付いていても読めるようにしてから検査する
      const cleaned = fixedText.replace(/[,，\s]/g, '').replace(/円$/, '');
      if (!/^\d+$/.test(cleaned)) {
        const reason = /^-/.test(cleaned)
          ? 'マイナスの金額は使えません。'
          : /\./.test(cleaned)
            ? '小数は使えません。1円単位で入力してください。'
            : '半角数字で入力してください。';
        errors.push({
          row: rowNumber,
          message: `${HEADER_FIXED}「${fixedText}」は使えません。${reason}`,
        });
        continue;
      }
      const parsed = Number(cleaned);
      if (!Number.isSafeInteger(parsed)) {
        errors.push({ row: rowNumber, message: `${HEADER_FIXED}「${fixedText}」が大きすぎます。` });
        continue;
      }
      fixedAmount = parsed;
      // 負担レベルが書いてあれば覚えておく（5段階へ戻したときに使う）
      if (levelText !== '') {
        level = LEVEL_BY_LABEL.get(levelText) ?? 'normal';
      }
    } else {
      if (levelText !== '') {
        const matched = LEVEL_BY_LABEL.get(levelText);
        if (!matched) {
          errors.push({
            row: rowNumber,
            message: `${HEADER_LEVEL}「${levelText}」は使えません。${levelLabels}のいずれかにしてください。`,
          });
          continue;
        }
        level = matched;
      }
      // 5段階の行に固定額が書いてあっても計算には使わないが、値は保持しておく
      const cleaned = fixedText.replace(/[,，\s]/g, '').replace(/円$/, '');
      if (/^\d+$/.test(cleaned)) {
        const parsed = Number(cleaned);
        if (Number.isSafeInteger(parsed)) fixedAmount = parsed;
      }
    }

    let absent = false;
    if (attendanceText !== '') {
      const key = attendanceText.toLowerCase();
      if (ABSENT_WORDS.has(key)) {
        absent = true;
      } else if (!ATTENDING_WORDS.has(key)) {
        errors.push({
          row: rowNumber,
          message: `${HEADER_ATTENDANCE}「${attendanceText}」は使えません。${ATTENDING_LABEL}または${ABSENT_LABEL}にしてください。`,
        });
        continue;
      }
    }

    if (participants.length >= MAX_PARTICIPANTS) {
      errors.push({ row: rowNumber, message: `参加者は最大${MAX_PARTICIPANTS}人までです。` });
      break;
    }

    const participant = createParticipant(name, level);
    participant.chargeMode = chargeMode;
    participant.fixedAmount = fixedAmount;
    participant.attendance = absent ? 'absent' : 'attending';
    participant.memo = memo;
    participants.push(participant);
  }

  return { participants, errors, fatal: null, sheetName: null };
}

/** 拡張子から、そもそも扱えない形式かどうかを見分ける */
function unsupportedFormatMessage(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return null;
  if (lower.endsWith('.xls')) {
    return '古い形式（.xls）は読み込めません。Excelで「名前を付けて保存」→「Excel ブック (.xlsx)」を選んでください。';
  }
  if (lower.endsWith('.xlsm')) {
    return 'マクロ付きブック（.xlsm）は読み込めません。「Excel ブック (.xlsx)」として保存し直してください。';
  }
  if (lower.endsWith('.csv')) {
    return 'CSVは読み込めません。Excelで開いてから「Excel ブック (.xlsx)」として保存してください。';
  }
  if (lower.endsWith('.numbers')) {
    return 'Numbers形式は読み込めません。「書き出す」→ Excel を選んで .xlsx にしてください。';
  }
  return null;
}

export async function readRosterFile(file: File): Promise<ImportResult> {
  const formatError = unsupportedFormatMessage(file.name);
  if (formatError) {
    return { participants: [], errors: [], fatal: formatError, sheetName: null };
  }

  try {
    const buffer = await file.arrayBuffer();
    const sheets = await readWorkbook(buffer);

    // 「名簿」シートがあればそれを優先し、無ければ見出しが見つかる最初のシートを使う
    const named = sheets.find((sheet) => normalizeHeader(sheet.name) === normalizeHeader(ROSTER_SHEET_NAME));
    const candidates = named ? [named] : sheets;

    let lastResult: ImportResult | null = null;
    for (const sheet of candidates) {
      const result = parseRosterRows(sheet.rows);
      if (!result.fatal) {
        return { ...result, sheetName: sheet.name };
      }
      lastResult = { ...result, sheetName: sheet.name };
    }

    return (
      lastResult ?? {
        participants: [],
        errors: [],
        sheetName: null,
        fatal: 'シートが見つかりませんでした。',
      }
    );
  } catch (error) {
    const message =
      error instanceof ZipReadError
        ? error.message
        : 'ファイルを読み込めませんでした。対応形式は .xlsx です。';
    return { participants: [], errors: [], fatal: message, sheetName: null };
  }
}

/* ------------------------------ 集金表出力 ------------------------------ */

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** サマリーや名簿の絞り込みと同じ言葉を使う */
const STATUS_LABELS: Record<string, string> = {
  unpaid: '未回収',
  settled: '精算完了',
  short: '差額あり（追加回収）',
  over: '差額あり（返金調整）',
  unknown: '要確認',
  none: '欠席',
};

export function buildCollectionWorkbook(
  event: OrganizerEvent,
  amounts: Record<string, number>,
  summary: OrganizerSummary,
): Blob {
  const collection: SheetData = {
    name: COLLECTION_SHEET_NAME,
    columnWidths: [18, 12, 14, 12, 12, 12, 10, 16, 20, 8, 28],
    headerRow: true,
    rows: [
      [
        HEADER_NAME,
        HEADER_CHARGE,
        HEADER_LEVEL,
        HEADER_FIXED,
        '徴収予定額',
        '回収済み金額',
        '差額',
        '精算状態',
        '回収日時',
        HEADER_ATTENDANCE,
        HEADER_MEMO,
      ],
      ...event.participants.map((participant) => {
        const attending = participant.attendance === 'attending';
        const isFixed = participant.chargeMode === 'fixed';
        const state = collectionOf(participant, amounts[participant.id] ?? 0);
        return [
          participant.name,
          isFixed ? CHARGE_FIXED_LABEL : CHARGE_WEIGHTED_LABEL,
          // 固定額の人は負担レベルを使わないので空欄にする
          isFixed ? '' : LEVEL_LABELS[participant.level],
          isFixed && participant.fixedAmount !== null ? participant.fixedAmount : '',
          attending ? state.due : 0,
          participant.collected && participant.collectedAmount !== null ? state.paid : '',
          state.status === 'short' || state.status === 'over' ? state.due - state.paid : 0,
          attending || participant.collected
            ? (STATUS_LABELS[state.status] ?? state.status)
            : STATUS_LABELS.none,
          formatDateTime(participant.collectedAt),
          attending ? ATTENDING_LABEL : ABSENT_LABEL,
          participant.memo,
        ];
      }),
    ],
  };

  const overview: SheetData = {
    name: OVERVIEW_SHEET_NAME,
    columnWidths: [24, 30],
    headerRow: true,
    rows: [
      ['項目', '内容'],
      ['飲み会名', event.name],
      ['会計金額', event.totalAmount],
      ['丸め単位', event.roundingUnit],
      ['名簿の人数', summary.totalCount],
      ['参加人数', summary.attendingCount],
      ['欠席人数', summary.absentCount],
      ['固定額の人数（出席）', summary.fixedCount],
      ['固定額の合計（出席）', summary.fixedTotal],
      ['5段階の人数（出席）', summary.weightedCount],
      ['徴収予定総額', summary.expectedAmount],
      ['実際の回収済み金額', summary.collectedAmount],
      ['残り回収必要額', summary.remainingAmount],
      ['過剰回収額', summary.overpaidAmount],
      ['精算完了人数', summary.settledCount],
      ['要対応人数', summary.actionNeededCount],
      ['未回収人数', summary.unpaidCount],
      ['差額あり人数（追加回収）', summary.shortCount],
      ['差額あり人数（返金調整）', summary.overCount],
      ['要確認人数', summary.unknownCount],
      ['欠席なのに回収記録がある人数', summary.absentCollectedCount],
      ['最終更新日時', formatDateTime(event.updatedAt)],
    ],
  };

  return buildWorkbook([collection, overview]);
}

/** ブラウザにファイルを保存させる。サーバーは介さない。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // 解放が早すぎると保存に失敗する端末があるため少し待つ
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** ファイル名に使えない文字を落とす。個人名は入れない方針なので飲み会名だけ使う。 */
export function toFileName(base: string, fallback: string): string {
  const cleaned = base.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
  return cleaned === '' ? fallback : cleaned;
}
