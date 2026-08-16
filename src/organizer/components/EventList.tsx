import { useState } from 'react';
import { ORGANIZER } from '../constants';
import { MAX_EVENT_NAME_LENGTH } from '../lib/storage';
import type { OrganizerState } from '../hooks/useOrganizerEvents';
import type { OrganizerEvent } from '../types';

interface Props {
  state: OrganizerState;
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function eventTitle(event: OrganizerEvent): string {
  return event.name.trim() === '' ? ORGANIZER.list.untitled : event.name.trim();
}

/**
 * /organizer/ を開いたときの入口。
 * いきなり大きな入力画面を出さず、「作る」か「開く」かだけを見せる。
 */
export function EventList({ state }: Props) {
  const [draftName, setDraftName] = useState('');

  const handleCreate = () => {
    state.addEvent(draftName.trim());
    setDraftName('');
  };

  return (
    <div className="orgList">
      <section className="orgCard" aria-labelledby="org-create">
        <h2 className="orgCard__title" id="org-create">
          {ORGANIZER.list.createHeading}
        </h2>
        <label className="visuallyHidden" htmlFor="org-new-name">
          {ORGANIZER.list.nameLabel}
        </label>
        <input
          id="org-new-name"
          className="orgInput"
          type="text"
          autoComplete="off"
          maxLength={MAX_EVENT_NAME_LENGTH}
          value={draftName}
          placeholder={ORGANIZER.list.namePlaceholder}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleCreate();
          }}
        />
        <button type="button" className="button button--primary button--large" onClick={handleCreate}>
          {ORGANIZER.list.create}
        </button>
      </section>

      <section className="orgSection" aria-labelledby="org-saved">
        <h2 className="orgSection__title" id="org-saved">
          {ORGANIZER.list.savedHeading}
        </h2>

        {state.events.length === 0 ? (
          <p className="orgHint">{ORGANIZER.list.empty}</p>
        ) : (
          <ul className="orgEvents">
            {state.events.map((event) => (
              <li className="orgEvent" key={event.id}>
                <button
                  type="button"
                  className="orgEvent__open"
                  onClick={() => state.openEvent(event.id)}
                >
                  <span className="orgEvent__name">{eventTitle(event)}</span>
                  <span className="orgEvent__meta">
                    {ORGANIZER.list.participants(event.participants.length)}・
                    {ORGANIZER.list.updatedAt(formatUpdatedAt(event.updatedAt))}
                  </span>
                </button>

                <div className="orgEvent__actions">
                  <button
                    type="button"
                    className="linkButton"
                    onClick={() => {
                      const next = window.prompt(ORGANIZER.list.renamePrompt, eventTitle(event));
                      if (next !== null) state.renameEvent(event.id, next.trim());
                    }}
                  >
                    {ORGANIZER.list.rename}
                  </button>
                  <button
                    type="button"
                    className="linkButton"
                    onClick={() => state.copyEvent(event.id, `${eventTitle(event)}${ORGANIZER.list.duplicateSuffix}`)}
                  >
                    {ORGANIZER.list.duplicate}
                  </button>
                  <button
                    type="button"
                    className="linkButton linkButton--danger"
                    onClick={() => {
                      if (window.confirm(ORGANIZER.list.removeConfirm(eventTitle(event)))) {
                        state.removeEvent(event.id);
                      }
                    }}
                  >
                    {ORGANIZER.list.remove}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
