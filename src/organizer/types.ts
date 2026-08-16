import type { LevelId, LevelWeights, RoundingUnit } from '../types/split';

/** 当日欠席した人を、名簿から消さずに計算対象外にするための状態 */
export type AttendanceStatus = 'attending' | 'absent';

/**
 * 徴収のしかた。
 * - weighted: 5段階の負担レベルで残額を分け合う（既定）
 * - fixed   : 金額を決め打ちする。先に差し引いてから残りを分ける
 */
export type ChargeMode = 'weighted' | 'fixed';

export interface OrganizerParticipant {
  /** 同姓同名を区別するための一意なID。名前では識別しない。 */
  id: string;
  name: string;
  chargeMode: ChargeMode;
  /**
   * 負担レベルはトップページと同じ5段階（src/types/split.ts の LevelId）を共有する。
   * 固定額に切り替えても消さない。5段階へ戻したときに元のレベルを復元するため。
   */
  level: LevelId;
  /**
   * 固定額（円）。chargeMode が 'fixed' のときだけ計算に使う。
   * null は「まだ入力していない」。0円は主賓・招待者などのために有効な値として扱う。
   */
  fixedAmount: number | null;
  attendance: AttendanceStatus;
  memo: string;
  collected: boolean;
  /** 回収済みにした時刻（ISO文字列）。未回収なら null。 */
  collectedAt: string | null;
  /**
   * 回収済みにした時点の徴収予定額。実際に受け取った金額として保持する。
   * あとで会計金額や負担レベルを変えても、この値は書き換えない。
   * これがないと「6,000円しか受け取っていないのに6,500円回収済み」と誤集計してしまう。
   * null は「回収済みだが金額の記録がない」（v1データからの移行分）を表す。
   */
  collectedAmount: number | null;
}

export interface OrganizerEvent {
  id: string;
  name: string;
  /** 会計金額（円）。未入力は0。 */
  totalAmount: number;
  roundingUnit: RoundingUnit;
  /** 負担レベルごとの割合。トップページと同じ仕組みを使う。 */
  weights: LevelWeights;
  participants: OrganizerParticipant[];
  createdAt: string;
  updatedAt: string;
}

/** localStorage に入れる全体。version はデータ構造を変えたときの migration 用。 */
export interface OrganizerStore {
  version: number;
  events: OrganizerEvent[];
}

/**
 * 名簿の絞り込み。サマリーの人数と同じ基準にするため、
 * 「回収済みフラグ」ではなく精算状況で分ける。
 */
export type ParticipantFilter = 'all' | 'action' | 'settled' | 'absent';
