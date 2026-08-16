import { useMemo, useState } from 'react';
import { RoundingSelect } from '../../components/RoundingSelect';
import { DEFAULT_WEIGHTS, LEVELS, MAX_AMOUNT_DIGITS, WEIGHT_MAX, WEIGHT_MIN, WEIGHT_STEP, BASE_LEVEL } from '../../constants/split';
import { digitsToDisplay, formatRatio, toDigits } from '../../lib/format';
import { ORGANIZER } from '../constants';
import { calculateOrganizerSplit, summarize } from '../lib/calculation';
import { MAX_EVENT_NAME_LENGTH } from '../lib/storage';
import type { OrganizerState } from '../hooks/useOrganizerEvents';
import type { OrganizerEvent, ParticipantFilter } from '../types';
import { EventSummary } from './EventSummary';
import { RosterExcelCard } from './RosterExcelCard';
import { OrganizerToolbar } from './OrganizerToolbar';
import { ParticipantList } from './ParticipantList';

interface Props {
  event: OrganizerEvent;
  state: OrganizerState;
}

export function EventEditor({ event, state }: Props) {
  const [filter, setFilter] = useState<ParticipantFilter>('all');
  const [weightsOpen, setWeightsOpen] = useState(false);

  // 金額・出欠・負担レベル・丸め単位のどれが変わってもここで再計算される
  const calculation = useMemo(() => calculateOrganizerSplit(event), [event]);
  const amounts = calculation.ok ? calculation.amounts : {};
  const summary = useMemo(() => summarize(event.participants, amounts), [event.participants, amounts]);

  /**
   * 計算できないときの案内。
   * 「まだ入力していないだけ」と「設定が矛盾している」を区別し、
   * 後者は警告として目立たせる（古い徴収額が残って見えないようにするため）。
   */
  const notice = useMemo(() => {
    if (calculation.ok) return null;
    switch (calculation.error) {
      case 'noTotal':
        return { text: ORGANIZER.summary.needAmount, isError: false };
      case 'noParticipants':
        return { text: ORGANIZER.summary.needParticipants, isError: false };
      case 'fixedOverTotal':
        return { text: ORGANIZER.summary.fixedOverTotal(calculation.amount), isError: true };
      case 'noPayer':
        return { text: ORGANIZER.summary.noPayer(calculation.amount), isError: true };
      case 'fixedAmountMissing':
        return {
          text: ORGANIZER.summary.fixedAmountMissing(calculation.names ?? []),
          isError: true,
        };
      default:
        return null;
    }
  }, [calculation]);

  const digits = event.totalAmount > 0 ? String(event.totalAmount) : '';

  return (
    <div className="orgEditor">
      <button type="button" className="linkButton orgBack" onClick={state.closeEvent}>
        {ORGANIZER.editor.back}
      </button>

      <section className="orgSection" aria-labelledby="org-event">
        <h2 className="visuallyHidden" id="org-event">
          {ORGANIZER.editor.nameLabel}
        </h2>
        <label className="visuallyHidden" htmlFor="org-event-name">
          {ORGANIZER.editor.nameLabel}
        </label>
        <input
          id="org-event-name"
          className="orgInput orgInput--title"
          type="text"
          autoComplete="off"
          maxLength={MAX_EVENT_NAME_LENGTH}
          value={event.name}
          placeholder={ORGANIZER.list.namePlaceholder}
          onChange={(changeEvent) => state.setName(changeEvent.target.value)}
        />
      </section>

      {/*
        名簿を作る入口。参加者を1人ずつ手入力し始める前に見えるよう、
        会計金額より前・画面の上部に置いている。
      */}
      <RosterExcelCard onImport={state.addParticipants} />

      <section className="orgSection" aria-labelledby="org-amount">
        <h3 className="orgSection__title orgSection__title--sub" id="org-amount">
          {ORGANIZER.editor.amountHeading}
        </h3>
        <label className="visuallyHidden" htmlFor="org-total">
          {ORGANIZER.editor.amountLabel}
        </label>
        <div className="amount__field">
          <input
            id="org-total"
            className="amount__input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            value={digitsToDisplay(digits)}
            placeholder="0"
            onChange={(changeEvent) => {
              const next = toDigits(changeEvent.target.value, MAX_AMOUNT_DIGITS);
              state.setTotalAmount(next === '' ? 0 : Number(next));
            }}
          />
          <span className="amount__suffix" aria-hidden="true">
            円
          </span>
        </div>

        <h3 className="orgSection__title orgSection__title--sub">{ORGANIZER.editor.roundingHeading}</h3>
        <RoundingSelect unit={event.roundingUnit} onChange={state.setRoundingUnit} />

        <button
          type="button"
          className="disclosure__toggle orgWeightsToggle"
          aria-expanded={weightsOpen}
          onClick={() => setWeightsOpen((value) => !value)}
        >
          {weightsOpen ? ORGANIZER.editor.advancedClose : ORGANIZER.editor.advanced}
        </button>

        {weightsOpen && (
          <div className="orgWeights">
            <p className="orgHint orgHint--tight">{ORGANIZER.editor.advancedHint}</p>
            {LEVELS.filter((level) => level.id !== BASE_LEVEL).map((level) => {
              const weight = event.weights[level.id];
              const sliderId = `org-weight-${level.id}`;
              return (
                <div className="orgWeights__row" key={level.id}>
                  <label className="orgWeights__label" htmlFor={sliderId}>
                    {level.label}
                    <span className="orgWeights__value">{formatRatio(weight)}倍</span>
                  </label>
                  <input
                    id={sliderId}
                    className="levelPanel__slider"
                    type="range"
                    min={WEIGHT_MIN}
                    max={WEIGHT_MAX}
                    step={WEIGHT_STEP}
                    value={weight}
                    aria-valuetext={`${formatRatio(weight)}倍`}
                    onChange={(changeEvent) =>
                      state.setWeight(level.id, Number(changeEvent.target.value))
                    }
                  />
                  {weight !== DEFAULT_WEIGHTS[level.id] && (
                    <button
                      type="button"
                      className="linkButton"
                      onClick={() => state.setWeight(level.id, DEFAULT_WEIGHTS[level.id])}
                    >
                      {ORGANIZER.editor.weightReset}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <EventSummary summary={summary} notice={notice} />

      <ParticipantList
        event={event}
        state={state}
        calculation={calculation}
        filter={filter}
        onFilterChange={setFilter}
      />

      <OrganizerToolbar
        event={event}
        calculation={calculation}
        summary={summary}
        onResetCollected={state.resetCollected}
      />
    </div>
  );
}
