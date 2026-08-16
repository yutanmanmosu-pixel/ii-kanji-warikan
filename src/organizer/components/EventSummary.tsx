import { ORGANIZER } from '../constants';
import { formatYen } from '../../lib/format';
import type { OrganizerSummary } from '../lib/calculation';

export interface SummaryNotice {
  text: string;
  /** true なら設定の矛盾。警告として目立たせる。 */
  isError: boolean;
}

interface Props {
  summary: OrganizerSummary;
  /** 計算できない場合に出す案内。null なら通常表示。 */
  notice: SummaryNotice | null;
}

/** 幹事がいちばん見たい数字を上にまとめて出す */
export function EventSummary({ summary, notice }: Props) {
  return (
    <section className="orgSummary" aria-labelledby="org-summary">
      <div className="orgSummary__head">
        <h2 className="orgSection__title" id="org-summary">
          {ORGANIZER.summary.heading}
        </h2>
        <span className="orgSummary__people">
          {ORGANIZER.summary.participants(summary.attendingCount, summary.totalCount)}
        </span>
      </div>

      {notice ? (
        notice.isError ? (
          <p className="notice notice--error orgSummary__invalid" role="alert">
            {notice.text}
          </p>
        ) : (
          <p className="orgHint">{notice.text}</p>
        )
      ) : (
        <>
          <p className="orgSummary__count">
            {ORGANIZER.summary.settledCount(summary.settledCount, summary.attendingCount)}
            {summary.actionNeededCount > 0 && (
              <span className="orgSummary__action">
                {ORGANIZER.summary.actionNeeded(summary.actionNeededCount)}
              </span>
            )}
          </p>

          <dl className="orgSummary__grid">
            <div className="orgSummary__item">
              <dt>{ORGANIZER.summary.expected}</dt>
              <dd>{formatYen(summary.expectedAmount)}</dd>
            </div>
            <div className="orgSummary__item orgSummary__item--ok">
              <dt>{ORGANIZER.summary.collected}</dt>
              <dd>{formatYen(summary.collectedAmount)}</dd>
            </div>
            <div className="orgSummary__item orgSummary__item--warn">
              <dt>{ORGANIZER.summary.unpaid}</dt>
              <dd>{formatYen(summary.remainingAmount)}</dd>
            </div>
          </dl>

          {summary.overpaidAmount > 0 && (
            <p className="orgSummary__warn">{ORGANIZER.summary.overpaid(summary.overpaidAmount)}</p>
          )}
          {summary.shortCount + summary.overCount > 0 && (
            <p className="orgSummary__warn">
              {ORGANIZER.summary.diffCount(summary.shortCount + summary.overCount)}
            </p>
          )}
          {summary.unknownCount > 0 && (
            <p className="orgSummary__warn">{ORGANIZER.summary.unknownCount(summary.unknownCount)}</p>
          )}
          {summary.absentCollectedCount > 0 && (
            <p className="orgSummary__warn">
              {ORGANIZER.summary.absentCollected(summary.absentCollectedCount)}
            </p>
          )}
          {summary.isComplete && <p className="orgSummary__done">{ORGANIZER.summary.complete}</p>}
        </>
      )}
    </section>
  );
}
