import { UI } from '../constants/messages';
import { formatYen } from './format';
import type { ResultGroup } from './resultRows';

/**
 * LINE などにそのまま貼れる文章を作る。
 * 宣伝文やURLは入れない（V1では余計な文字を足さない方針）。
 *
 * 段階でまとめた行は「◯人：△円ずつ」と書く。
 * 「ずつ」がないと合計額なのか1人あたりなのか読み取れないため。
 * メモを入れていれば括弧で添える。
 */
export function buildShareText(total: number, groups: ResultGroup[], withClosing: boolean): string {
  const body = groups.map((group) => {
    if (group.kind === 'fixed') {
      const label = group.label === '' ? UI.result.fixedLabel : group.label;
      return `${label}：${formatYen(group.buckets[0]?.amount ?? 0)}`;
    }

    const who = group.memo === '' ? '' : `（${group.memo}）`;
    const head = `${group.label} ${UI.result.count(group.count)}`;

    if (group.buckets.length === 1) {
      const suffix = group.count > 1 ? UI.result.each : '';
      return `${head}：${formatYen(group.buckets[0].amount)}${suffix}${who}`;
    }

    const parts = group.buckets
      .map((bucket) => `${formatYen(bucket.amount)}が${UI.result.count(bucket.count)}`)
      .join('、');
    return `${head}：${parts}${who}`;
  });

  const lines = [
    '🍻 今日のお会計',
    `合計：${formatYen(total)}`,
    '',
    ...body,
    '',
    `合計：${formatYen(total)}`,
  ];

  if (withClosing) {
    lines.push('', UI.result.closing);
  }

  return lines.join('\n');
}
