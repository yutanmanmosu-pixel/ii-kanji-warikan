import { useRef, useState } from 'react';
import { ORGANIZER } from '../constants';
import { buildRosterTemplate, downloadBlob, readRosterFile, type ImportResult } from '../lib/excel';
import type { OrganizerParticipant } from '../types';
import { ButtonLabel } from './ButtonLabel';

interface Props {
  onImport: (participants: OrganizerParticipant[], mode: 'replace' | 'append') => void;
}

/**
 * 名簿を作るための入口。参加者を手入力し始める前に見えるよう、編集画面の上部に置く。
 *
 * 「大人数だと1人ずつ入力するしかない」と思われて離脱するのを防ぐのが目的。
 * ただし少人数の人の邪魔にならないよう、補助的な見た目にとどめる。
 *
 * Excelの処理そのものは既存の lib/excel.ts をそのまま呼ぶ（別実装は作らない）。
 */
export function RosterExcelCard({ onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus('');
    const result = await readRosterFile(file);
    setBusy(false);
    setPending(result);
    // 同じファイルを続けて選べるように値を消す
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyImport = (mode: 'replace' | 'append') => {
    if (!pending) return;
    onImport(pending.participants, mode);
    setStatus(ORGANIZER.excel.importDone(pending.participants.length));
    setPending(null);
  };

  return (
    <section className="orgExcelCard" aria-labelledby="org-excel-card">
      <h2 className="orgExcelCard__title" id="org-excel-card">
        {ORGANIZER.excel.cardHeading}
      </h2>
      <p className="orgExcelCard__lead">{ORGANIZER.excel.cardLead}</p>

      <div className="orgExcelCard__actions">
        <button
          type="button"
          className="button"
          onClick={() => downloadBlob(buildRosterTemplate(), ORGANIZER.excel.templateFileName)}
        >
          <ButtonLabel parts={ORGANIZER.excel.templateParts} />
        </button>

        <button type="button" className="button" onClick={() => fileRef.current?.click()}>
          <ButtonLabel parts={ORGANIZER.excel.importParts} />
        </button>
      </div>

      <label className="visuallyHidden" htmlFor="org-file">
        {ORGANIZER.excel.importLabel}
      </label>
      <input
        id="org-file"
        ref={fileRef}
        className="visuallyHidden"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(changeEvent) => void handleFile(changeEvent.target.files?.[0])}
      />

      {busy && <p className="orgStatus">{ORGANIZER.excel.reading}</p>}

      {pending && (
        <div className="orgImport" role="group" aria-label={ORGANIZER.excel.import}>
          {pending.fatal && <p className="orgImport__error">{pending.fatal}</p>}

          {pending.sheetName && !pending.fatal && (
            <p className="orgHint orgHint--tight">{ORGANIZER.excel.importSheet(pending.sheetName)}</p>
          )}

          {pending.errors.length > 0 && (
            <>
              <p className="orgImport__error">{ORGANIZER.excel.importErrors(pending.errors.length)}</p>
              <ul className="orgImport__list">
                {pending.errors.slice(0, 10).map((error) => (
                  <li key={`${error.row}-${error.message}`}>
                    {error.row}行目：{error.message}
                  </li>
                ))}
              </ul>
            </>
          )}

          {pending.participants.length > 0 ? (
            <>
              <p className="orgImport__ready">{ORGANIZER.excel.importReady(pending.participants.length)}</p>
              <div className="orgActions">
                <button type="button" className="button button--primary" onClick={() => applyImport('replace')}>
                  {ORGANIZER.excel.importReplace}
                </button>
                <button type="button" className="button" onClick={() => applyImport('append')}>
                  {ORGANIZER.excel.importAppend}
                </button>
                <button type="button" className="button button--quiet" onClick={() => setPending(null)}>
                  {ORGANIZER.excel.importCancel}
                </button>
              </div>
            </>
          ) : (
            !pending.fatal && (
              <>
                <p className="orgImport__error">{ORGANIZER.excel.importNone}</p>
                <div className="orgActions">
                  <button type="button" className="button button--quiet" onClick={() => setPending(null)}>
                    {ORGANIZER.excel.importCancel}
                  </button>
                </div>
              </>
            )
          )}
        </div>
      )}

      <p className="orgStatus" aria-live="polite">
        {status}
      </p>

      <p className="orgExcelCard__note">{ORGANIZER.excel.cardNote}</p>
    </section>
  );
}
