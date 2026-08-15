import { useState } from 'react';
import { UI } from '../constants/messages';
import { MAX_AMOUNT_DIGITS, MAX_NAME_LENGTH } from '../constants/split';
import { digitsToDisplay, toDigits } from '../lib/format';
import type { SplitForm } from '../hooks/useSplitForm';

interface Props {
  form: SplitForm;
}

/**
 * 「この人は3,000円」と決めたい人だけを並べる。
 * 人数カウンターとは独立していて、ここに出るのは固定金額の人だけ。
 */
export function FixedSection({ form }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="disclosure">
      <button
        type="button"
        className="disclosure__toggle"
        aria-expanded={open}
        aria-controls={open ? 'fixed-panel' : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? UI.fixed.close : UI.fixed.open}
      </button>

      {open && (
        <div className="disclosure__panel" id="fixed-panel">
          <p className="disclosure__lead">{UI.fixed.lead}</p>

          <ul className="fixedList">
            {form.fixed.map((member, index) => {
              const digits = member.amount > 0 ? String(member.amount) : '';
              return (
                <li className="fixedRow" key={member.id}>
                  <label className="visuallyHidden" htmlFor={`${member.id}-name`}>
                    {UI.fixed.nameLabel(index)}
                  </label>
                  <input
                    id={`${member.id}-name`}
                    className="fixedRow__name"
                    type="text"
                    autoComplete="off"
                    maxLength={MAX_NAME_LENGTH}
                    value={member.name}
                    placeholder={UI.fixed.namePlaceholder}
                    onChange={(event) => form.updateFixed(member.id, { name: event.target.value })}
                  />

                  <label className="visuallyHidden" htmlFor={`${member.id}-amount`}>
                    {UI.fixed.amountLabel(index)}
                  </label>
                  <div className="fixedField">
                    <input
                      id={`${member.id}-amount`}
                      className="fixedField__input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={digitsToDisplay(digits)}
                      placeholder={UI.fixed.amountPlaceholder}
                      onChange={(event) => {
                        const next = toDigits(event.target.value, MAX_AMOUNT_DIGITS);
                        form.updateFixed(member.id, { amount: next === '' ? 0 : Number(next) });
                      }}
                    />
                    <span className="fixedField__suffix" aria-hidden="true">
                      円
                    </span>
                  </div>

                  <button
                    type="button"
                    className="linkButton linkButton--danger"
                    aria-label={UI.fixed.removeLabel(index)}
                    onClick={() => form.removeFixed(member.id)}
                  >
                    {UI.fixed.remove}
                  </button>
                </li>
              );
            })}
          </ul>

          <button type="button" className="addButton" disabled={!form.canAddFixed} onClick={form.addFixed}>
            {UI.fixed.add}
          </button>
          {!form.canAddFixed && <p className="counters__note">{UI.fixed.limit}</p>}
          <p className="counters__note">{UI.fixed.ignored}</p>
        </div>
      )}
    </div>
  );
}
