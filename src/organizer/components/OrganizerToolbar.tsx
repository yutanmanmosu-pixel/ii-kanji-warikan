import { useState } from 'react';
import { canUseWebShare, copyToClipboard, shareViaWebShare } from '../../lib/clipboard';
import { ORGANIZER } from '../constants';
import { buildCollectionText, buildUnpaidText } from '../lib/share';
import { buildCollectionWorkbook, downloadBlob, toFileName } from '../lib/excel';
import type { OrganizerCalculation, OrganizerSummary } from '../lib/calculation';
import type { OrganizerEvent } from '../types';
import { ButtonLabel } from './ButtonLabel';

interface Props {
  event: OrganizerEvent;
  calculation: OrganizerCalculation;
  /** 集金表Excelの出力に使う。名簿を作ったあとの機能なのでここに置く。 */
  summary: OrganizerSummary;
  onResetCollected: () => void;
}

/** 集金案内のコピー・共有と、回収状況のリセット */
export function OrganizerToolbar({ event, calculation, summary, onResetCollected }: Props) {
  const [status, setStatus] = useState('');
  const [shareSupported] = useState(canUseWebShare);

  const amounts = calculation.ok ? calculation.amounts : {};
  const disabled = !calculation.ok;

  const runCopy = async (text: string) => {
    const succeeded = await copyToClipboard(text);
    setStatus(succeeded ? ORGANIZER.toolbar.copied : ORGANIZER.toolbar.copyFailed);
  };

  return (
    <section className="orgSection" aria-labelledby="org-toolbar">
      <h2 className="orgSection__title orgSection__title--sub" id="org-toolbar">
        {ORGANIZER.toolbar.heading}
      </h2>

      <div className="orgActions">
        <button
          type="button"
          className="button"
          disabled={disabled}
          onClick={() => runCopy(buildCollectionText(event, amounts))}
        >
          {ORGANIZER.toolbar.copyCollection}
        </button>
        <button
          type="button"
          className="button"
          disabled={disabled}
          onClick={() => runCopy(buildUnpaidText(event, amounts))}
        >
          {ORGANIZER.toolbar.copyUnpaid}
        </button>
        {shareSupported && (
          <button
            type="button"
            className="button"
            disabled={disabled}
            onClick={() => shareViaWebShare(buildCollectionText(event, amounts))}
          >
            {ORGANIZER.toolbar.share}
          </button>
        )}
        <button
          type="button"
          className="button"
          disabled={disabled}
          onClick={() =>
            downloadBlob(
              buildCollectionWorkbook(event, amounts, summary),
              ORGANIZER.excel.collectionFileName(toFileName(event.name, '飲み会')),
            )
          }
        >
          <ButtonLabel parts={ORGANIZER.excel.exportParts} />
        </button>

        <button
          type="button"
          className="button button--quiet"
          onClick={() => {
            if (window.confirm(ORGANIZER.toolbar.resetConfirm)) {
              onResetCollected();
              setStatus(ORGANIZER.toolbar.reset);
            }
          }}
        >
          {ORGANIZER.toolbar.resetCollected}
        </button>
      </div>

      {disabled && <p className="orgHint orgHint--tight">{ORGANIZER.excel.exportDisabled}</p>}

      <p className="orgStatus" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
