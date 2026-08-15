import { useMemo, useState } from 'react';
import { UI, errorMessage, warningMessage } from '../constants/messages';
import { canUseWebShare, copyToClipboard, shareViaWebShare } from '../lib/clipboard';
import { formatYen } from '../lib/format';
import { buildResultGroups } from '../lib/resultRows';
import { buildShareText } from '../lib/shareText';
import type { LevelMemos, SplitResult } from '../types/split';

interface Props {
  result: SplitResult;
  memos: LevelMemos;
  onEdit: () => void;
  onReset: () => void;
}

type CopyStatus = 'idle' | 'copied' | 'failed';

export function ResultPanel({ result, memos, onEdit, onReset }: Props) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [withClosing, setWithClosing] = useState(true);
  const [shareSupported] = useState(canUseWebShare);

  const groups = useMemo(
    () => (result.ok ? buildResultGroups(result.shares, memos) : []),
    [result, memos],
  );

  const shareText = useMemo(
    () => (result.ok ? buildShareText(result.total, groups, withClosing) : ''),
    [result, groups, withClosing],
  );

  if (!result.ok) {
    return (
      <div className="notice notice--error" role="alert">
        <p className="notice__text">{errorMessage(result.error, result.amount)}</p>
      </div>
    );
  }

  const handleCopy = async () => {
    const succeeded = await copyToClipboard(shareText);
    setCopyStatus(succeeded ? 'copied' : 'failed');
  };

  const handleShare = async () => {
    await shareViaWebShare(shareText);
  };

  const handleReset = () => {
    if (window.confirm(UI.result.resetConfirm)) {
      setCopyStatus('idle');
      onReset();
    }
  };

  return (
    <div className="result">
      {result.warnings.map((warning) => (
        <div key={warning} className="notice notice--warn" role="alert">
          <p className="notice__text">{warningMessage(warning)}</p>
        </div>
      ))}

      <div className="receipt">
        <div className="receipt__head">
          <span className="receipt__headLabel">{UI.result.totalLabel}</span>
          <span className="receipt__headAmount">{formatYen(result.total)}</span>
        </div>

        <ul>
          {groups.map((group) => {
            const single = group.buckets.length === 1;
            const tags = [
              group.kind === 'fixed' ? UI.result.fixedTag : UI.result.count(group.count),
              group.memo,
            ].filter((text) => text !== '');

            return (
              <li className="receipt__row" key={group.key}>
                <span className="receipt__name">
                  {group.label === '' ? UI.result.fixedLabel : group.label}
                </span>
                <span className="receipt__amounts">
                  {group.buckets.map((bucket) => (
                    <span className="receipt__amount" key={bucket.amount}>
                      {formatYen(bucket.amount)}
                      {single && group.count > 1 && <span className="receipt__each">{UI.result.each}</span>}
                      {!single && <span className="receipt__each">{UI.result.perPeople(bucket.count)}</span>}
                    </span>
                  ))}
                </span>
                <span className="receipt__tags">
                  {tags.join('・')}
                  {group.buckets.some((bucket) => bucket.roundingDiff > 0) && (
                    <span className="receipt__adjust">
                      {UI.result.roundingTag(
                        Math.max(...group.buckets.map((bucket) => bucket.roundingDiff)),
                      )}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="receipt__total">
          <span className="receipt__totalLabel">{UI.result.sumLabel}</span>
          <span className="receipt__totalAmount">{formatYen(result.sum)}</span>
          <span className="receipt__match">✓ {UI.result.matched}</span>
        </div>
      </div>

      <div className="result__actions">
        <button type="button" className="button button--primary" onClick={handleCopy}>
          {UI.result.copy}
        </button>
        {shareSupported && (
          <button type="button" className="button" onClick={handleShare}>
            {UI.result.share}
          </button>
        )}
        <button type="button" className="button" onClick={onEdit}>
          {UI.result.edit}
        </button>
        <button type="button" className="button button--quiet" onClick={handleReset}>
          {UI.result.reset}
        </button>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={withClosing}
          onChange={(event) => {
            setWithClosing(event.target.checked);
            setCopyStatus('idle');
          }}
        />
        <span>
          {UI.result.closingToggle}（「{UI.result.closing}」）
        </span>
      </label>

      <p className="result__status" aria-live="polite">
        {copyStatus === 'copied' && UI.result.copied}
        {copyStatus === 'failed' && UI.result.copyFailed}
      </p>

      {copyStatus === 'failed' && (
        <>
          <label className="visuallyHidden" htmlFor="copy-fallback">
            {UI.result.copyTextLabel}
          </label>
          <textarea
            id="copy-fallback"
            className="result__fallback"
            readOnly
            rows={groups.length + 7}
            value={shareText}
          />
        </>
      )}
    </div>
  );
}
