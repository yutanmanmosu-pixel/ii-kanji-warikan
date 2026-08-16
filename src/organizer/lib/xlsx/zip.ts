import { inflateRaw, InflateError } from './inflate';

/**
 * .xlsx は中身がZIPなので、最小限のZIP読み書きを自前で用意する。
 *
 * 外部ライブラリを足さない理由:
 *   - このプロジェクトは依存を react / react-dom だけに保っている
 *   - Excel入出力のためだけに数百KBのライブラリを足すと初期表示が重くなる
 *   - 展開は inflate.ts に自前実装したので、ブラウザのAPIに依存しない
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Blob に渡せるよう、バッファ型を ArrayBuffer に固定した Uint8Array */
export type Bytes = Uint8Array<ArrayBuffer>;

export interface ZipEntry {
  path: string;
  data: Bytes;
}

/**
 * MS-DOS形式の日時に変換する。
 * 0 のままだと「月0日0日」という存在しない日付になり、
 * 一部のツールが警告を出すため、必ず妥当な値を書き込む。
 */
function toDosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/* ------------------------------- 書き出し ------------------------------- */

/**
 * 無圧縮(store)のZIPを作る。
 * Excel も Google スプレッドシートも無圧縮のZIPをそのまま開ける。
 */
export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const stamp = toDosDateTime(new Date());
  const localParts: Bytes[] = [];
  const centralParts: Bytes[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const checksum = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true); // ローカルファイルヘッダ
    localView.setUint16(4, 20, true); // 展開に必要なバージョン
    localView.setUint16(6, 0x0800, true); // ファイル名をUTF-8として扱う
    localView.setUint16(8, 0, true); // 圧縮方式: 0 = 無圧縮
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true); // 拡張フィールドなし
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // セントラルディレクトリ
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ------------------------------- 読み込み ------------------------------- */

export class ZipReadError extends Error {}

/**
 * ZIPを展開してパス→中身のMapを返す。
 * 無圧縮(0)とdeflate(8)にだけ対応する。Excelが作るファイルはこの2つ。
 *
 * サイズはセントラルディレクトリ側の値を使う。
 * 書き出しツールによってはローカルヘッダのサイズが0のことがあるため。
 */
export function readZip(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22) {
    throw new ZipReadError('Excelファイルとして読み取れませんでした。');
  }
  const view = new DataView(buffer);

  // 末尾からEnd of Central Directoryを探す（コメントがあると末尾ちょうどにない）
  let endOffset = -1;
  const searchLimit = Math.max(0, bytes.length - 22 - 0xffff);
  for (let index = bytes.length - 22; index >= searchLimit; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) {
    throw new ZipReadError('Excelファイルとして読み取れませんでした。');
  }

  const entryCount = view.getUint16(endOffset + 10, true);
  let cursor = view.getUint32(endOffset + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new ZipReadError('Excelファイルとして読み取れませんでした。');
    }

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const path = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    // ローカルヘッダ側の長さを読み直さないと本体の開始位置が分からない
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new ZipReadError('Excelファイルとして読み取れませんでした。');
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new ZipReadError('Excelファイルとして読み取れませんでした。');
    }
    const raw = bytes.subarray(dataStart, dataEnd);

    if (method === 0) {
      files.set(path, raw);
    } else if (method === 8) {
      try {
        files.set(path, inflateRaw(raw, uncompressedSize));
      } catch (error) {
        if (error instanceof InflateError) {
          throw new ZipReadError('Excelファイルを展開できませんでした。ファイルが壊れている可能性があります。');
        }
        throw error;
      }
    }
    // それ以外の圧縮方式（暗号化ZIPなど）は使われないので黙って飛ばす

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

export function decodeText(bytes: Uint8Array | undefined): string {
  if (!bytes) return '';
  return new TextDecoder().decode(bytes);
}

export function encodeText(text: string): Bytes {
  return new TextEncoder().encode(text);
}
