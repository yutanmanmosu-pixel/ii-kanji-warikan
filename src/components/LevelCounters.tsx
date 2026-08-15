import { useState } from 'react';
import { UI } from '../constants/messages';
import { LEVELS } from '../constants/split';
import type { SplitForm } from '../hooks/useSplitForm';
import type { LevelId } from '../types/split';
import { LevelSettings } from './LevelSettings';

interface Props {
  form: SplitForm;
}

/**
 * このアプリの入力の中心。
 * 参加者を1人ずつ並べるのではなく「この段階が何人」を数で入れる。
 * 飲み会の席では名前より人数のほうが早く入力できるため。
 *
 * 割合スライダーとメモは、左端の「＋」を押したときだけ開く。
 * ふつうの割り勘なら開かずに終わる。
 */
export function LevelCounters({ form }: Props) {
  const [openLevel, setOpenLevel] = useState<LevelId | null>(null);

  return (
    <div className="counters">
      <ul className="counters__list">
        {LEVELS.map((level) => {
          const count = form.counts[level.id];
          const open = openLevel === level.id;
          const panelId = `level-${level.id}`;

          return (
            <li className="counter" key={level.id}>
              <div className="counter__main">
                <button
                  type="button"
                  className="counter__expand"
                  aria-expanded={open}
                  aria-controls={open ? panelId : undefined}
                  aria-label={
                    open ? UI.counters.closeSettings(level.label) : UI.counters.openSettings(level.label)
                  }
                  onClick={() => setOpenLevel(open ? null : level.id)}
                >
                  {open ? '−' : '＋'}
                </button>
                <span className="counter__label">{level.label}</span>

                <div className="counter__controls">
                  <button
                    type="button"
                    className="counter__step"
                    aria-label={UI.counters.decrease(level.label)}
                    disabled={count === 0}
                    onClick={() => form.decrement(level.id)}
                  >
                    −
                  </button>
                  <span className="counter__value">
                    {count}
                    <span className="counter__unit">{UI.counters.unit}</span>
                  </span>
                  <button
                    type="button"
                    className="counter__step"
                    aria-label={UI.counters.increase(level.label)}
                    disabled={!form.canAdd}
                    onClick={() => form.increment(level.id)}
                  >
                    ＋
                  </button>
                </div>
              </div>

              {open && (
                <LevelSettings
                  level={level}
                  panelId={panelId}
                  weight={form.weights[level.id]}
                  memo={form.memos[level.id]}
                  onWeightChange={(weight) => form.setWeight(level.id, weight)}
                  onWeightReset={() => form.resetWeight(level.id)}
                  onMemoChange={(memo) => form.setMemo(level.id, memo)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {form.fixedCount > 0 && <p className="counters__note">{UI.counters.fixedNote(form.fixedCount)}</p>}
      {!form.canAdd && <p className="counters__note">{UI.counters.limit}</p>}
    </div>
  );
}
