import type { LevelCounts, LevelId, LevelMemos, LevelWeights, RoundingUnit } from '../types/split';

export interface LevelDef {
  id: LevelId;
  label: string;
  /** ふつうを1.0としたときの既定の割合（内部は整数） */
  defaultWeight: number;
}

/**
 * 画面に出す並び順。少なめ → 多めで統一する（入力欄も結果も同じ順）。
 * 割合はスライダーでユーザーが変更できるので、ここにあるのは初期値。
 */
export const LEVELS: LevelDef[] = [
  { id: 'less', label: '少なめ', defaultWeight: 50 },
  { id: 'slightlyLess', label: 'ちょい少なめ', defaultWeight: 80 },
  { id: 'normal', label: 'ふつう', defaultWeight: 100 },
  { id: 'slightlyMore', label: 'ちょい多め', defaultWeight: 120 },
  { id: 'more', label: '多め', defaultWeight: 150 },
];

export const LEVEL_ORDER: LevelId[] = LEVELS.map((level) => level.id);

export const LEVEL_LABELS: Record<LevelId, string> = LEVELS.reduce(
  (acc, level) => {
    acc[level.id] = level.label;
    return acc;
  },
  {} as Record<LevelId, string>,
);

export const DEFAULT_WEIGHTS: LevelWeights = LEVELS.reduce(
  (acc, level) => {
    acc[level.id] = level.defaultWeight;
    return acc;
  },
  {} as LevelWeights,
);

/** 「ふつう」は基準なので割合を変えられない。ほかの段階との相対値だけで決まるため。 */
export const BASE_LEVEL: LevelId = 'normal';
export const BASE_WEIGHT = 100;

/** スライダーの範囲: 0.1倍 〜 3.0倍 を 0.05 刻み */
export const WEIGHT_MIN = 10;
export const WEIGHT_MAX = 300;
export const WEIGHT_STEP = 5;

export function emptyCounts(): LevelCounts {
  return LEVEL_ORDER.reduce((acc, level) => {
    acc[level] = 0;
    return acc;
  }, {} as LevelCounts);
}

export function emptyMemos(): LevelMemos {
  return LEVEL_ORDER.reduce((acc, level) => {
    acc[level] = '';
    return acc;
  }, {} as LevelMemos);
}

export const ROUNDING_UNITS: RoundingUnit[] = [1, 10, 100, 500, 1000];

/** 飲み会の現金精算でいちばん扱いやすい単位 */
export const DEFAULT_ROUNDING_UNIT: RoundingUnit = 100;

export const DEFAULT_NORMAL_COUNT = 4;
export const MAX_HEADCOUNT = 30;
export const MAX_FIXED_ROWS = 10;

/** 会計金額・固定金額の桁数上限（1億円未満）。異常値でも壊れないための保険。 */
export const MAX_AMOUNT_DIGITS = 8;
export const MAX_NAME_LENGTH = 12;
export const MAX_MEMO_LENGTH = 40;
