import { UI } from '../constants/messages';
import { MAX_AMOUNT_DIGITS } from '../constants/split';
import { digitsToDisplay, toDigits } from '../lib/format';

interface Props {
  digits: string;
  onChange: (digits: string) => void;
}

export function AmountInput({ digits, onChange }: Props) {
  return (
    <div className="amount">
      <label className="visuallyHidden" htmlFor="total-amount">
        {UI.amount.label}
      </label>
      <div className="amount__field">
        <input
          id="total-amount"
          className="amount__input"
          // inputMode=numeric でスマホの数字キーボードを出す。
          // type=number にしないのは、カンマ付き表示ができず、
          // スピナーや e / - の入力で事故が起きやすいため。
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          value={digitsToDisplay(digits)}
          placeholder={UI.amount.placeholder}
          onChange={(event) => onChange(toDigits(event.target.value, MAX_AMOUNT_DIGITS))}
        />
        <span className="amount__suffix" aria-hidden="true">
          {UI.amount.suffix}
        </span>
      </div>
    </div>
  );
}
