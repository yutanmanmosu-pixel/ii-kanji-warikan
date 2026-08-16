/**
 * 幹事モードへの導線。
 * トップページの「すぐ使える」体験を邪魔しないよう、
 * 入力欄より上ではなく計算結果のあと（広告の前）に小さく置く。
 */
export function OrganizerLink() {
  return (
    <aside className="crossLink">
      <p className="crossLink__title">事前に名簿がある幹事さんへ</p>
      <p className="crossLink__text">
        歓送迎会・忘年会など、参加者が事前に決まっている場合は、
        名簿と集金状況を管理できる「幹事モード」が便利です。
      </p>
      <a className="crossLink__button" href="/organizer/">
        幹事モードを使う →
      </a>
    </aside>
  );
}
