import { Fragment } from 'react';

interface Props {
  /** 意味のまとまりごとに区切ったラベル。例: ['名簿テンプレートを', 'ダウンロード'] */
  parts: readonly string[];
}

/**
 * ボタンの文字が「ダウン / ロード」のように単語の途中で折り返されるのを防ぐ。
 *
 * 日本語はブラウザが好きな位置で改行できてしまうので、
 * 意味のまとまりを nowrap の塊にし、その間にだけ <wbr>（改行してよい位置）を置く。
 * 幅が足りていれば1行、足りなければ意図した位置だけで2行になる。
 */
export function ButtonLabel({ parts }: Props) {
  return (
    <span className="btnLabel">
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 && <wbr />}
          <span className="btnLabel__part">{part}</span>
        </Fragment>
      ))}
    </span>
  );
}
