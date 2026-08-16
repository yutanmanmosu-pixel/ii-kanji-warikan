import { formatYen } from '../../lib/format';
import type { OrganizerEvent, OrganizerParticipant } from '../types';
import { attendingParticipants, collectionOf } from './calculation';

/**
 * 集金案内の文章づくり。
 * 端末の外に出るのは、幹事が自分でコピー／共有したときだけ。
 */

function line(participant: OrganizerParticipant, amounts: Record<string, number>): string {
  return `${participant.name}：${formatYen(amounts[participant.id] ?? 0)}`;
}

export function buildCollectionText(
  event: OrganizerEvent,
  amounts: Record<string, number>,
): string {
  const attending = attendingParticipants(event.participants);
  const title = event.name.trim() === '' ? '飲み会のお会計' : event.name.trim();

  return [
    `🍻 ${title}`,
    `合計：${formatYen(event.totalAmount)}`,
    '',
    ...attending.map((participant) => line(participant, amounts)),
    '',
    'よろしくお願いします！',
  ].join('\n');
}

export function buildUnpaidText(
  event: OrganizerEvent,
  amounts: Record<string, number>,
): string {
  const title = event.name.trim() === '' ? '飲み会のお会計' : event.name.trim();

  // まだ集めきれていない人＝未回収・不足あり・金額の記録なし
  const rows = attendingParticipants(event.participants)
    .map((participant) => ({
      participant,
      collection: collectionOf(participant, amounts[participant.id] ?? 0),
    }))
    .filter(({ collection }) => collection.shortage > 0);

  if (rows.length === 0) {
    return `${title}\n\n未回収の方はいません。ありがとうございました！`;
  }

  const total = rows.reduce((sum, row) => sum + row.collection.shortage, 0);

  return [
    `【${title}】まだお預かりできていない方`,
    '',
    // 一部だけ受け取っている人は、残りの金額を書く
    ...rows.map(({ participant, collection }) =>
      collection.paid > 0
        ? `${participant.name}：${formatYen(collection.shortage)}（${formatYen(collection.due)}のうち${formatYen(collection.paid)}受け取り済み）`
        : `${participant.name}：${formatYen(collection.shortage)}`,
    ),
    '',
    `未回収：${rows.length}人・${formatYen(total)}`,
  ].join('\n');
}
