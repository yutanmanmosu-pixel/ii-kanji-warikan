/**
 * raw DEFLATE（RFC 1951）の展開。
 *
 * ブラウザ標準の DecompressionStream('deflate-raw') は
 * Safari 16.4 未満・古いAndroid WebView では使えず、
 * 「iPhoneだけExcelを読み込めない」という事故になりうる。
 * .xlsx は数十KB程度なので、自前展開でも速度は問題にならない。
 */

export class InflateError extends Error {}

/** 長さコード257〜285の基準値と追加ビット数 */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

/** 距離コード0〜29の基準値と追加ビット数 */
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

/** 符号長の並び順（RFC 1951 で決められている） */
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
  /** 符号長ごとのシンボル数 */
  counts: Int32Array;
  /** 符号長順に並べたシンボル */
  symbols: Int32Array;
}

/** 符号長の一覧から、正準ハフマン符号の表を作る */
function buildHuffman(lengths: Uint8Array, maxBits: number): Huffman {
  const counts = new Int32Array(maxBits + 1);
  for (const length of lengths) {
    if (length > maxBits) throw new InflateError('壊れた圧縮データです。');
    counts[length] += 1;
  }
  counts[0] = 0;

  const offsets = new Int32Array(maxBits + 2);
  for (let bits = 1; bits <= maxBits; bits += 1) {
    offsets[bits + 1] = offsets[bits] + counts[bits];
  }

  const symbols = new Int32Array(lengths.length);
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol];
    if (length !== 0) {
      symbols[offsets[length]] = symbol;
      offsets[length] += 1;
    }
  }

  return { counts, symbols };
}

class BitReader {
  private bytePos = 0;
  private bitBuffer = 0;
  private bitCount = 0;
  private readonly data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  /** 下位ビットから n ビット読む */
  read(count: number): number {
    while (this.bitCount < count) {
      if (this.bytePos >= this.data.length) {
        throw new InflateError('圧縮データが途中で終わっています。');
      }
      this.bitBuffer |= this.data[this.bytePos] << this.bitCount;
      this.bytePos += 1;
      this.bitCount += 8;
    }
    const value = this.bitBuffer & ((1 << count) - 1);
    this.bitBuffer >>>= count;
    this.bitCount -= count;
    return value;
  }

  /** バイト境界まで読み飛ばす（非圧縮ブロックの前に必要） */
  alignToByte(): void {
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  get position(): number {
    return this.bytePos;
  }

  set position(value: number) {
    this.bytePos = value;
  }

  /** ハフマン符号を1つ読む（ビットは上位から順に符号を構成する） */
  decode(table: Huffman): number {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length <= 15; length += 1) {
      code |= this.read(1);
      const count = table.counts[length];
      if (code - first < count) {
        return table.symbols[index + (code - first)];
      }
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new InflateError('壊れた圧縮データです。');
  }
}

let fixedLiteral: Huffman | null = null;
let fixedDistance: Huffman | null = null;

function getFixedTables(): { literal: Huffman; distance: Huffman } {
  if (!fixedLiteral || !fixedDistance) {
    const literalLengths = new Uint8Array(288);
    literalLengths.fill(8, 0, 144);
    literalLengths.fill(9, 144, 256);
    literalLengths.fill(7, 256, 280);
    literalLengths.fill(8, 280, 288);
    fixedLiteral = buildHuffman(literalLengths, 15);

    const distanceLengths = new Uint8Array(30);
    distanceLengths.fill(5);
    fixedDistance = buildHuffman(distanceLengths, 15);
  }
  return { literal: fixedLiteral, distance: fixedDistance };
}

/** 出力サイズが分からないので、必要に応じて倍々に伸ばす */
class OutputBuffer {
  private buffer: Uint8Array;
  private length = 0;

  constructor(initialSize: number) {
    this.buffer = new Uint8Array(Math.max(initialSize, 1024));
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  push(byte: number): void {
    this.ensure(1);
    this.buffer[this.length] = byte;
    this.length += 1;
  }

  /** 過去に出力した位置からコピーする（LZ77） */
  copyFrom(distance: number, count: number): void {
    if (distance > this.length) {
      throw new InflateError('壊れた圧縮データです。');
    }
    this.ensure(count);
    let from = this.length - distance;
    for (let index = 0; index < count; index += 1) {
      this.buffer[this.length] = this.buffer[from];
      this.length += 1;
      from += 1;
    }
  }

  append(data: Uint8Array): void {
    this.ensure(data.length);
    this.buffer.set(data, this.length);
    this.length += data.length;
  }

  toUint8Array(): Uint8Array<ArrayBuffer> {
    const result = new Uint8Array(this.length);
    result.set(this.buffer.subarray(0, this.length));
    return result;
  }
}

/**
 * raw deflate（zlibヘッダなし）を展開する。
 * expectedSize が分かっていれば、最初の確保サイズに使う。
 */
export function inflateRaw(input: Uint8Array, expectedSize = 0): Uint8Array<ArrayBuffer> {
  const reader = new BitReader(input);
  const output = new OutputBuffer(expectedSize > 0 ? expectedSize : input.length * 4);

  for (;;) {
    const isFinal = reader.read(1);
    const type = reader.read(2);

    if (type === 0) {
      // 非圧縮ブロック
      reader.alignToByte();
      const start = reader.position;
      if (start + 4 > input.length) throw new InflateError('圧縮データが途中で終わっています。');
      const length = input[start] | (input[start + 1] << 8);
      const check = input[start + 2] | (input[start + 3] << 8);
      if ((length ^ 0xffff) !== check) throw new InflateError('壊れた圧縮データです。');
      const from = start + 4;
      if (from + length > input.length) throw new InflateError('圧縮データが途中で終わっています。');
      output.append(input.subarray(from, from + length));
      reader.position = from + length;
    } else if (type === 1 || type === 2) {
      let literal: Huffman;
      let distance: Huffman;

      if (type === 1) {
        const fixed = getFixedTables();
        literal = fixed.literal;
        distance = fixed.distance;
      } else {
        // 動的ハフマン: まず符号長そのものの符号表を読む
        const literalCount = reader.read(5) + 257;
        const distanceCount = reader.read(5) + 1;
        const codeLengthCount = reader.read(4) + 4;

        const codeLengths = new Uint8Array(19);
        for (let index = 0; index < codeLengthCount; index += 1) {
          codeLengths[CODE_LENGTH_ORDER[index]] = reader.read(3);
        }
        const codeLengthTable = buildHuffman(codeLengths, 7);

        const lengths = new Uint8Array(literalCount + distanceCount);
        let index = 0;
        while (index < lengths.length) {
          const symbol = reader.decode(codeLengthTable);
          if (symbol < 16) {
            lengths[index] = symbol;
            index += 1;
          } else if (symbol === 16) {
            if (index === 0) throw new InflateError('壊れた圧縮データです。');
            const previous = lengths[index - 1];
            let repeat = 3 + reader.read(2);
            while (repeat > 0 && index < lengths.length) {
              lengths[index] = previous;
              index += 1;
              repeat -= 1;
            }
          } else if (symbol === 17) {
            index += 3 + reader.read(3);
          } else {
            index += 11 + reader.read(7);
          }
        }
        if (index > lengths.length) throw new InflateError('壊れた圧縮データです。');

        literal = buildHuffman(lengths.subarray(0, literalCount), 15);
        distance = buildHuffman(lengths.subarray(literalCount), 15);
      }

      for (;;) {
        const symbol = reader.decode(literal);
        if (symbol === 256) break;

        if (symbol < 256) {
          output.push(symbol);
          continue;
        }

        const lengthIndex = symbol - 257;
        if (lengthIndex >= LENGTH_BASE.length) throw new InflateError('壊れた圧縮データです。');
        const copyLength = LENGTH_BASE[lengthIndex] + reader.read(LENGTH_EXTRA[lengthIndex]);

        const distanceSymbol = reader.decode(distance);
        if (distanceSymbol >= DIST_BASE.length) throw new InflateError('壊れた圧縮データです。');
        const copyDistance = DIST_BASE[distanceSymbol] + reader.read(DIST_EXTRA[distanceSymbol]);

        output.copyFrom(copyDistance, copyLength);
      }
    } else {
      throw new InflateError('壊れた圧縮データです。');
    }

    if (isFinal) break;
  }

  return output.toUint8Array();
}
