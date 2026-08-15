import { UI } from '../constants/messages';
import {
  BASE_LEVEL,
  DEFAULT_WEIGHTS,
  MAX_MEMO_LENGTH,
  WEIGHT_MAX,
  WEIGHT_MIN,
  WEIGHT_STEP,
} from '../constants/split';
import { formatRatio } from '../lib/format';
import type { LevelDef } from '../constants/split';

interface Props {
  level: LevelDef;
  panelId: string;
  weight: number;
  memo: string;
  onWeightChange: (weight: number) => void;
  onWeightReset: () => void;
  onMemoChange: (memo: string) => void;
}

/**
 * 各段階の「＋」を押したときに開くパネル。
 * ふつうは基準なので割合を出さず、メモだけにしている。
 */
export function LevelSettings({
  level,
  panelId,
  weight,
  memo,
  onWeightChange,
  onWeightReset,
  onMemoChange,
}: Props) {
  const sliderId = `${panelId}-ratio`;
  const memoId = `${panelId}-memo`;
  const isBase = level.id === BASE_LEVEL;
  const defaultWeight = DEFAULT_WEIGHTS[level.id];

  return (
    <div className="levelPanel" id={panelId}>
      {isBase ? (
        <p className="levelPanel__hint">{UI.levelSettings.baseHint}</p>
      ) : (
        <div className="levelPanel__block">
          <label className="levelPanel__label" htmlFor={sliderId}>
            {UI.levelSettings.ratioLabel}
            <span className="levelPanel__value">{UI.levelSettings.ratioValue(formatRatio(weight))}</span>
          </label>
          <input
            id={sliderId}
            className="levelPanel__slider"
            type="range"
            min={WEIGHT_MIN}
            max={WEIGHT_MAX}
            step={WEIGHT_STEP}
            value={weight}
            // スクリーンリーダーには「0.8倍」と読ませる（生の数値は意味が伝わらないため）
            aria-valuetext={UI.levelSettings.ratioValue(formatRatio(weight))}
            onChange={(event) => onWeightChange(Number(event.target.value))}
          />
          <p className="levelPanel__hint">{UI.levelSettings.ratioHint}</p>
          {weight !== defaultWeight && (
            <button type="button" className="linkButton" onClick={onWeightReset}>
              {UI.levelSettings.reset(formatRatio(defaultWeight))}
            </button>
          )}
        </div>
      )}

      <div className="levelPanel__block">
        <label className="levelPanel__label" htmlFor={memoId}>
          {UI.levelSettings.memoLabel}
        </label>
        <input
          id={memoId}
          className="levelPanel__memo"
          type="text"
          autoComplete="off"
          maxLength={MAX_MEMO_LENGTH}
          value={memo}
          placeholder={UI.levelSettings.memoPlaceholder}
          onChange={(event) => onMemoChange(event.target.value)}
        />
        <p className="levelPanel__hint">{UI.levelSettings.memoHint}</p>
      </div>
    </div>
  );
}
