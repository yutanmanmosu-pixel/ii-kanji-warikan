/** 負担の強さ。UI では「少なめ / ちょい少なめ / ふつう…」の日本語で見せる。 */
export type LevelId = 'less' | 'slightlyLess' | 'normal' | 'slightlyMore' | 'more';

/** 各段階が何人か */
export type LevelCounts = Record<LevelId, number>;

/**
 * 各段階の割合。「ふつう = 100」を基準にした整数で持つ。
 * 0.8 のような小数で持つと分配計算で誤差が出るため、内部は最後まで整数で扱う。
 * ユーザーにはスライダーで「0.8倍」のように見せる。
 */
export type LevelWeights = Record<LevelId, number>;

/** 各段階につけられる自由記述のメモ（例:「田中、佐藤」）。計算には影響しない。 */
export type LevelMemos = Record<LevelId, string>;

/** 先に金額を差し引く人。金額が0の行は「まだ入力していない」とみなして無視する。 */
export interface FixedMember {
  id: string;
  name: string;
  amount: number;
}

export type RoundingUnit = 1 | 10 | 100 | 500 | 1000;

export interface SplitInput {
  /** 会計総額（円） */
  total: number;
  unit: RoundingUnit;
  counts: LevelCounts;
  weights: LevelWeights;
  fixed: FixedMember[];
}

export type SplitShare =
  | { kind: 'level'; level: LevelId; amount: number; roundingDiff: number }
  | { kind: 'fixed'; id: string; name: string; amount: number; roundingDiff: number };

export type SplitErrorCode =
  /** 会計金額が未入力または0円 */
  | 'noTotal'
  /** 参加者が0人 */
  | 'noParticipants'
  /** 固定金額の合計が会計金額を超えている */
  | 'fixedOverTotal'
  /** 残額があるのに、分け合う人が1人もいない */
  | 'noPayer';

export type SplitWarningCode =
  /** 丸め単位が大きすぎて、ほとんどの人が0円になっている */
  'unitTooLarge';

export type SplitResult =
  | {
      ok: true;
      total: number;
      /** shares の合計。必ず total と一致する。 */
      sum: number;
      headcount: number;
      shares: SplitShare[];
      warnings: SplitWarningCode[];
    }
  | {
      ok: false;
      error: SplitErrorCode;
      /** 超過額・不足額など、メッセージに埋め込む金額（円） */
      amount: number;
    };
