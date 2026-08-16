import { useId, useState } from 'react';
import { LEVELS, MAX_AMOUNT_DIGITS } from '../../constants/split';
import { digitsToDisplay, toDigits } from '../../lib/format';
import { formatYen } from '../../lib/format';
import { ORGANIZER } from '../constants';
import { MAX_PARTICIPANT_MEMO_LENGTH, MAX_PARTICIPANT_NAME_LENGTH } from '../lib/storage';
import type { LevelId } from '../../types/split';
import type { AttendanceStatus, ChargeMode, OrganizerParticipant } from '../types';
import type { ParticipantCollection } from '../lib/calculation';

interface Props {
  participant: OrganizerParticipant;
  index: number;
  /** 徴収額。まだ計算できないときは null。 */
  amount: number | null;
  /** 徴収予定額と実際に受け取った額の関係 */
  collection: ParticipantCollection;
  roundingDiff: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<OrganizerParticipant>) => void;
  onCollectedChange: (collected: boolean) => void;
  /** 差額をやりとりして、受け取った額をいまの徴収予定額に合わせる */
  onSettle: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

function formatCollectedAt(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * スマートフォンでは横長の表が使いづらいので、1人1カードで表示する。
 */
export function ParticipantRow({
  participant,
  index,
  amount,
  collection,
  roundingDiff,
  isFirst,
  isLast,
  onChange,
  onCollectedChange,
  onSettle,
  onMove,
  onRemove,
}: Props) {
  const [memoOpen, setMemoOpen] = useState(participant.memo !== '');
  const reactId = useId();
  const nameId = `${reactId}-name`;
  const chargeId = `${reactId}-charge`;
  const levelId = `${reactId}-level`;
  const fixedId = `${reactId}-fixed`;
  const attendanceId = `${reactId}-attendance`;
  const memoId = `${reactId}-memo`;

  const isAttending = participant.attendance === 'attending';
  const isFixed = participant.chargeMode === 'fixed';
  const fixedDigits = participant.fixedAmount === null ? '' : String(participant.fixedAmount);
  const displayName = participant.name.trim() === '' ? ORGANIZER.roster.unnamed : participant.name.trim();

  return (
    <li className={collection.status === 'settled' ? 'orgPerson is-collected' : 'orgPerson'}>
      <div className="orgPerson__top">
        <label className="visuallyHidden" htmlFor={nameId}>
          {ORGANIZER.roster.nameLabel(index)}
        </label>
        <input
          id={nameId}
          className="orgPerson__name"
          type="text"
          autoComplete="off"
          maxLength={MAX_PARTICIPANT_NAME_LENGTH}
          value={participant.name}
          placeholder={ORGANIZER.roster.nameLabel(index)}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <span className="orgPerson__amount">
          {!isAttending ? (
            <span className="orgPerson__absent">{ORGANIZER.roster.absentAmount}</span>
          ) : amount === null ? (
            <span className="orgPerson__absent">{ORGANIZER.roster.waiting}</span>
          ) : (
            formatYen(amount)
          )}
        </span>
      </div>

      <div className="orgPerson__controls">
        <label className="visuallyHidden" htmlFor={chargeId}>
          {`${displayName}の${ORGANIZER.roster.chargeLabel}`}
        </label>
        <select
          id={chargeId}
          className="orgSelect"
          value={participant.chargeMode}
          // 徴収方法を変えても level と fixedAmount は消さない。
          // 5段階へ戻したときに元のレベルが復元され、固定額も残る。
          onChange={(event) => onChange({ chargeMode: event.target.value as ChargeMode })}
        >
          <option value="weighted">{ORGANIZER.roster.chargeWeighted}</option>
          <option value="fixed">{ORGANIZER.roster.chargeFixed}</option>
        </select>

        {/* 固定額のときは負担レベルを出さない（情報過多を避ける） */}
        {!isFixed && (
          <>
            <label className="visuallyHidden" htmlFor={levelId}>
              {`${displayName}の${ORGANIZER.roster.levelLabel}`}
            </label>
            <select
              id={levelId}
              className="orgSelect"
              value={participant.level}
              onChange={(event) => onChange({ level: event.target.value as LevelId })}
            >
              {LEVELS.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.label}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="visuallyHidden" htmlFor={attendanceId}>
          {`${displayName}の${ORGANIZER.roster.attendanceLabel}`}
        </label>
        <select
          id={attendanceId}
          className="orgSelect"
          value={participant.attendance}
          onChange={(event) => onChange({ attendance: event.target.value as AttendanceStatus })}
        >
          <option value="attending">{ORGANIZER.roster.attending}</option>
          <option value="absent">{ORGANIZER.roster.absent}</option>
        </select>
      </div>

      {isFixed && (
        <div className="orgFixed">
          <label className="orgFixed__label" htmlFor={fixedId}>
            {ORGANIZER.roster.fixedLabel}
          </label>
          <div className="orgFixed__field">
            <input
              id={fixedId}
              className="orgFixed__input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={digitsToDisplay(fixedDigits)}
              placeholder={ORGANIZER.roster.fixedPlaceholder}
              onChange={(event) => {
                const next = toDigits(event.target.value, MAX_AMOUNT_DIGITS);
                // 空欄は「未入力」。0円は主賓などのために有効な値として残す。
                onChange({ fixedAmount: next === '' ? null : Number(next) });
              }}
            />
            <span className="orgFixed__unit" aria-hidden="true">
              {ORGANIZER.roster.fixedUnit}
            </span>
          </div>
          {participant.fixedAmount === null && (
            <p className="orgPerson__note">{ORGANIZER.roster.fixedEmpty}</p>
          )}
        </div>
      )}

      {isAttending && (
        <>
          <label className={amount === null ? 'orgCollect is-disabled' : 'orgCollect'}>
            <input
              type="checkbox"
              checked={participant.collected}
              // 徴収額が決まっていないと、いくら受け取ったか記録できない
              disabled={amount === null}
              onChange={(event) => onCollectedChange(event.target.checked)}
            />
            <span className="orgCollect__label">{ORGANIZER.roster.collected}</span>
            {participant.collected && participant.collectedAt && (
              <span className="orgCollect__time">
                {ORGANIZER.roster.collectedAt(formatCollectedAt(participant.collectedAt))}
              </span>
            )}
          </label>
          {amount === null && <p className="orgPerson__note">{ORGANIZER.roster.needAmount}</p>}
        </>
      )}

      {/* 差額があるときだけ、受け取った額と不足・過剰を出す */}
      {collection.status === 'short' && (
        <div className="orgDiff">
          <p className="orgDiff__text">
            {ORGANIZER.roster.paidLabel}：{formatYen(collection.paid)}
            <span className="orgDiff__badge">{ORGANIZER.roster.shortage(collection.shortage)}</span>
          </p>
          <button type="button" className="button button--small" onClick={onSettle}>
            {ORGANIZER.roster.settleShort(collection.shortage)}
          </button>
        </div>
      )}

      {collection.status === 'over' && (
        <div className="orgDiff">
          <p className="orgDiff__text">
            {ORGANIZER.roster.paidLabel}：{formatYen(collection.paid)}
            <span className="orgDiff__badge">{ORGANIZER.roster.excess(collection.excess)}</span>
          </p>
          <button type="button" className="button button--small" onClick={onSettle}>
            {ORGANIZER.roster.settleExcess(collection.excess)}
          </button>
        </div>
      )}

      {collection.status === 'unknown' && (
        <div className="orgDiff">
          <p className="orgDiff__text">
            <span className="orgDiff__badge">{ORGANIZER.roster.unknownAmount}</span>
          </p>
          {amount !== null && (
            <button type="button" className="button button--small" onClick={onSettle}>
              {ORGANIZER.roster.settleUnknown(collection.due)}
            </button>
          )}
        </div>
      )}

      {roundingDiff > 0 && isAttending && (
        <p className="orgPerson__note">{ORGANIZER.roster.roundingTag(roundingDiff)}</p>
      )}

      <div className="orgPerson__footer">
        <button
          type="button"
          className="linkButton"
          aria-expanded={memoOpen}
          onClick={() => setMemoOpen((value) => !value)}
        >
          {ORGANIZER.roster.memoToggle}
        </button>
        <span className="orgPerson__spacer" />
        <button
          type="button"
          className="orgIconButton"
          aria-label={`${displayName}を${ORGANIZER.roster.moveUp}`}
          disabled={isFirst}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="orgIconButton"
          aria-label={`${displayName}を${ORGANIZER.roster.moveDown}`}
          disabled={isLast}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="linkButton linkButton--danger"
          onClick={() => {
            if (window.confirm(ORGANIZER.roster.removeConfirm(displayName))) onRemove();
          }}
        >
          {ORGANIZER.roster.remove}
        </button>
      </div>

      {memoOpen && (
        <>
          <label className="visuallyHidden" htmlFor={memoId}>
            {`${displayName}の${ORGANIZER.roster.memoLabel}`}
          </label>
          <input
            id={memoId}
            className="orgPerson__memo"
            type="text"
            autoComplete="off"
            maxLength={MAX_PARTICIPANT_MEMO_LENGTH}
            value={participant.memo}
            placeholder={ORGANIZER.roster.memoPlaceholder}
            onChange={(event) => onChange({ memo: event.target.value })}
          />
        </>
      )}
    </li>
  );
}
