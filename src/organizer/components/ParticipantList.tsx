import { useState } from 'react';
import { SegmentedControl } from '../../components/SegmentedControl';
import { FILTER_OPTIONS, ORGANIZER } from '../constants';
import { MAX_PARTICIPANT_NAME_LENGTH } from '../lib/storage';
import type { OrganizerState } from '../hooks/useOrganizerEvents';
import {
  collectionOf,
  matchesParticipantFilter,
  matchesParticipantSearch,
  type OrganizerCalculation,
} from '../lib/calculation';
import type { OrganizerEvent, ParticipantFilter } from '../types';
import { ParticipantRow } from './ParticipantRow';

interface Props {
  event: OrganizerEvent;
  state: OrganizerState;
  calculation: OrganizerCalculation;
  filter: ParticipantFilter;
  onFilterChange: (filter: ParticipantFilter) => void;
}

export function ParticipantList({ event, state, calculation, filter, onFilterChange }: Props) {
  const [draftName, setDraftName] = useState('');
  // 検索文字列は一時的な表示状態なので localStorage には保存しない
  const [search, setSearch] = useState('');

  const handleAdd = () => {
    const name = draftName.trim();
    if (name === '') return;
    state.addParticipant(name);
    setDraftName('');
  };

  const visible = event.participants
    .map((participant, index) => {
      const amount = calculation.ok ? (calculation.amounts[participant.id] ?? 0) : null;
      return { participant, index, amount, collection: collectionOf(participant, amount ?? 0) };
    })
    // 判定は calculation.ts に置き、サマリーの人数と必ず同じ基準にする。
    // 検索はフィルターとのAND条件。あくまで表示上の絞り込みで、計算には影響しない。
    .filter(
      ({ participant, collection }) =>
        matchesParticipantFilter(collection.status, filter) &&
        matchesParticipantSearch(participant.name, search),
    );

  return (
    <section className="orgSection" aria-labelledby="org-roster">
      <h2 className="orgSection__title" id="org-roster">
        {ORGANIZER.roster.heading}
      </h2>

      <div className="orgAdd">
        <label className="visuallyHidden" htmlFor="org-add-name">
          {ORGANIZER.roster.addLabel}
        </label>
        <input
          id="org-add-name"
          className="orgInput orgAdd__input"
          type="text"
          autoComplete="off"
          maxLength={MAX_PARTICIPANT_NAME_LENGTH}
          value={draftName}
          placeholder={ORGANIZER.roster.addPlaceholder}
          onChange={(changeEvent) => setDraftName(changeEvent.target.value)}
          onKeyDown={(keyEvent) => {
            // 続けて何人も入れられるよう、Enterで追加して入力欄を空にする
            if (keyEvent.key === 'Enter') {
              keyEvent.preventDefault();
              handleAdd();
            }
          }}
        />
        <button type="button" className="button button--primary orgAdd__button" onClick={handleAdd}>
          {ORGANIZER.roster.add}
        </button>
      </div>
      <p className="orgHint orgHint--tight">{ORGANIZER.roster.addHint}</p>

      {event.participants.length > 0 && (
        <>
          <div className="orgFilter">
            <SegmentedControl
              groupLabel={ORGANIZER.filter.label}
              options={FILTER_OPTIONS}
              value={filter}
              onChange={onFilterChange}
              size="sm"
            />
          </div>

          <div className="orgSearch">
            <label className="visuallyHidden" htmlFor="org-search">
              {ORGANIZER.roster.searchLabel}
            </label>
            <input
              id="org-search"
              className="orgSearch__input"
              type="search"
              autoComplete="off"
              value={search}
              placeholder={ORGANIZER.roster.searchPlaceholder}
              onChange={(changeEvent) => setSearch(changeEvent.target.value)}
            />
            {search !== '' && (
              <button
                type="button"
                className="orgSearch__clear"
                aria-label={ORGANIZER.roster.searchClear}
                onClick={() => setSearch('')}
              >
                ×
              </button>
            )}
          </div>

          {visible.length !== event.participants.length && (
            <p className="orgHint orgHint--tight">
              {ORGANIZER.roster.searchCount(visible.length, event.participants.length)}
            </p>
          )}
        </>
      )}

      {event.participants.length === 0 ? (
        <p className="orgHint">{ORGANIZER.roster.empty}</p>
      ) : visible.length === 0 ? (
        <p className="orgHint">{ORGANIZER.roster.emptyFiltered}</p>
      ) : (
        <ul className="orgPeople">
          {visible.map(({ participant, index, amount, collection }) => (
            <ParticipantRow
              key={participant.id}
              participant={participant}
              index={index}
              amount={amount}
              collection={collection}
              roundingDiff={calculation.ok ? (calculation.roundingDiffs[participant.id] ?? 0) : 0}
              isFirst={index === 0}
              isLast={index === event.participants.length - 1}
              onChange={(patch) => state.updateParticipant(participant.id, patch)}
              onCollectedChange={(collected) =>
                state.setCollected(participant.id, collected, collection.due)
              }
              onSettle={() => state.settleDifference(participant.id, collection.due)}
              onMove={(direction) => state.moveParticipant(participant.id, direction)}
              onRemove={() => state.removeParticipant(participant.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
