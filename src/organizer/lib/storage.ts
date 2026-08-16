import { DEFAULT_ROUNDING_UNIT, DEFAULT_WEIGHTS, LEVEL_ORDER, ROUNDING_UNITS } from '../../constants/split';
import type { LevelId, LevelWeights, RoundingUnit } from '../../types/split';
import type {
  AttendanceStatus,
  ChargeMode,
  OrganizerEvent,
  OrganizerParticipant,
  OrganizerStore,
} from '../types';
import { createId } from './id';

/**
 * 名簿は端末の localStorage にだけ保存する。サーバーへは一切送らない。
 * キーにバージョンを含めておき、将来データ構造を変えたときに migration できるようにする。
 */
export const STORAGE_KEY = 'ii-kanji-warikan.organizer.v3';

/**
 * 古い形式から移行するためのキー。新しい順に探す。
 * - v1: collectedAmount なし
 * - v2: chargeMode / fixedAmount なし
 * 見つかった時点で読み込み、v3 として保存し直す。古いキーは消さない（安全側）。
 */
export const LEGACY_STORAGE_KEYS = [
  'ii-kanji-warikan.organizer.v2',
  'ii-kanji-warikan.organizer.v1',
];
export const STORE_VERSION = 3;

export const MAX_EVENT_NAME_LENGTH = 40;
export const MAX_PARTICIPANT_NAME_LENGTH = 20;
export const MAX_PARTICIPANT_MEMO_LENGTH = 40;
export const MAX_PARTICIPANTS = 100;
export const MAX_EVENTS = 50;

export function emptyStore(): OrganizerStore {
  return { version: STORE_VERSION, events: [] };
}

/* ------------------------------------------------------------------ *
 * 値の正規化
 * 壊れた保存データや古い形式が来ても、例外を投げずに安全な値へ寄せる。
 * ------------------------------------------------------------------ */

function toText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  // 制御文字を除き、長すぎる入力は切り詰める
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

function toAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function toChargeMode(value: unknown): ChargeMode {
  // 未設定（v2以前のデータ）は5段階として扱う
  return value === 'fixed' ? 'fixed' : 'weighted';
}

/** 0円は有効。空欄・負の値・小数・数値でないものは「未入力」として null にする。 */
function toFixedAmount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function toLevel(value: unknown): LevelId {
  return LEVEL_ORDER.includes(value as LevelId) ? (value as LevelId) : 'normal';
}

function toRoundingUnit(value: unknown): RoundingUnit {
  return ROUNDING_UNITS.includes(value as RoundingUnit)
    ? (value as RoundingUnit)
    : DEFAULT_ROUNDING_UNIT;
}

function toAttendance(value: unknown): AttendanceStatus {
  return value === 'absent' ? 'absent' : 'attending';
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : value;
}

function toWeights(value: unknown): LevelWeights {
  const source = (value ?? {}) as Record<string, unknown>;
  const weights = { ...DEFAULT_WEIGHTS };
  for (const level of LEVEL_ORDER) {
    const raw = source[level];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      weights[level] = Math.round(raw);
    }
  }
  // 範囲外の値は calculateSplit 側でも丸められるが、保存前に整えておく
  return weights;
}

export function sanitizeParticipant(value: unknown): OrganizerParticipant {
  const source = (value ?? {}) as Record<string, unknown>;
  const collected = source.collected === true;

  // 回収済みでないのに金額や日時が残っていたら消す。
  // v1データには collectedAmount 自体が無いので null（金額不明）になる。
  // ここで現在の徴収額を当てはめて推測することはしない。
  const rawAmount = source.collectedAmount;
  const collectedAmount =
    collected && typeof rawAmount === 'number' && Number.isFinite(rawAmount) && rawAmount >= 0
      ? Math.floor(rawAmount)
      : null;

  return {
    id: typeof source.id === 'string' && source.id !== '' ? source.id : createId('p'),
    name: toText(source.name, MAX_PARTICIPANT_NAME_LENGTH),
    chargeMode: toChargeMode(source.chargeMode),
    level: toLevel(source.level),
    fixedAmount: toFixedAmount(source.fixedAmount),
    attendance: toAttendance(source.attendance),
    memo: toText(source.memo, MAX_PARTICIPANT_MEMO_LENGTH),
    collected,
    collectedAt: collected ? toIsoDate(source.collectedAt) : null,
    collectedAmount,
  };
}

export function sanitizeEvent(value: unknown): OrganizerEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;

  const participants = Array.isArray(source.participants)
    ? source.participants.slice(0, MAX_PARTICIPANTS).map(sanitizeParticipant)
    : [];

  const now = new Date().toISOString();
  return {
    id: typeof source.id === 'string' && source.id !== '' ? source.id : createId('e'),
    name: toText(source.name, MAX_EVENT_NAME_LENGTH),
    totalAmount: toAmount(source.totalAmount),
    roundingUnit: toRoundingUnit(source.roundingUnit),
    weights: toWeights(source.weights),
    participants,
    createdAt: toIsoDate(source.createdAt) ?? now,
    updatedAt: toIsoDate(source.updatedAt) ?? now,
  };
}

/** 保存文字列 → データ。壊れていても例外を投げず、空の状態を返す。 */
export function parseStore(raw: string | null): OrganizerStore {
  if (!raw) return emptyStore();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSONとして壊れている場合は、諦めて空から始める
    return emptyStore();
  }

  if (typeof parsed !== 'object' || parsed === null) return emptyStore();
  const source = parsed as Record<string, unknown>;
  if (!Array.isArray(source.events)) return emptyStore();

  const events = source.events
    .slice(0, MAX_EVENTS)
    .map(sanitizeEvent)
    .filter((event): event is OrganizerEvent => event !== null);

  return { version: STORE_VERSION, events };
}

export function serializeStore(store: OrganizerStore): string {
  return JSON.stringify({ version: STORE_VERSION, events: store.events });
}

/* ------------------------------------------------------------------ *
 * localStorage への読み書き
 * プライベートモードなどで使えない場合も、アプリは動き続ける。
 * ------------------------------------------------------------------ */

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 保存データを読む。v2 が無ければ v1 から移行する。
 * v1 の「回収済み」は金額の記録がないので collectedAmount = null のままにし、
 * 画面で幹事に確認してもらう。勝手に金額を推測しない。
 */
export function loadStore(): OrganizerStore {
  const storage = getLocalStorage();
  if (!storage) return emptyStore();

  try {
    const current = storage.getItem(STORAGE_KEY);
    if (current !== null) return parseStore(current);

    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = storage.getItem(key);
      if (legacy === null) continue;
      const migrated = parseStore(legacy);
      if (migrated.events.length > 0) {
        // 移行結果を保存する。元のキーは残しておく（万一のときに戻せるように）
        saveStore(migrated);
      }
      return migrated;
    }

    return emptyStore();
  } catch {
    return emptyStore();
  }
}

/** 保存できたかどうかを返す（容量超過などで失敗しても落とさない） */
export function saveStore(store: OrganizerStore): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, serializeStore(store));
    return true;
  } catch {
    return false;
  }
}

export function isStorageAvailable(): boolean {
  return getLocalStorage() !== null;
}

/* ------------------------------------------------------------------ *
 * 生成
 * ------------------------------------------------------------------ */

export function createParticipant(name = '', level: LevelId = 'normal'): OrganizerParticipant {
  return {
    id: createId('p'),
    name: toText(name, MAX_PARTICIPANT_NAME_LENGTH),
    // 既定は今までどおり5段階の「ふつう」。固定額は使う人だけが切り替える。
    chargeMode: 'weighted',
    level,
    fixedAmount: null,
    attendance: 'attending',
    memo: '',
    collected: false,
    collectedAt: null,
    collectedAmount: null,
  };
}

export function createEvent(name: string): OrganizerEvent {
  const now = new Date().toISOString();
  return {
    id: createId('e'),
    name: toText(name, MAX_EVENT_NAME_LENGTH),
    totalAmount: 0,
    roundingUnit: DEFAULT_ROUNDING_UNIT,
    weights: { ...DEFAULT_WEIGHTS },
    participants: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 飲み会を複製する。
 * 名簿（名前・負担レベル・出欠・メモ）は引き継ぎ、
 * 会計金額と集金状況はリセットする。次の飲み会の準備に使えるようにするため。
 */
export function duplicateEvent(event: OrganizerEvent, name: string): OrganizerEvent {
  const now = new Date().toISOString();
  return {
    id: createId('e'),
    name: toText(name, MAX_EVENT_NAME_LENGTH),
    totalAmount: 0,
    roundingUnit: event.roundingUnit,
    weights: { ...event.weights },
    // 名前・徴収方法・負担レベル・固定額・メモは引き継ぎ、集金情報だけ消す
    participants: event.participants.map((participant) => ({
      ...participant,
      id: createId('p'),
      collected: false,
      collectedAt: null,
      collectedAmount: null,
    })),
    createdAt: now,
    updatedAt: now,
  };
}
