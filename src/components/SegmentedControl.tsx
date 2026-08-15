export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  /** スクリーンリーダー用のグループ名 */
  groupLabel: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'md' | 'sm';
}

/**
 * ラジオボタンではなく button + aria-pressed を使う。
 * 指1本で押しやすい大きさを保ちつつ、選択状態を色だけでなく太字と枠線でも示す。
 */
export function SegmentedControl<T extends string | number>({
  groupLabel,
  options,
  value,
  onChange,
  size = 'md',
}: Props<T>) {
  const classNames = ['segment', size === 'sm' ? 'segment--sm' : ''].filter(Boolean).join(' ');

  return (
    <div className={classNames} role="group" aria-label={groupLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            className={selected ? 'segment__item is-selected' : 'segment__item'}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
