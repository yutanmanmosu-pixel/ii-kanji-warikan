import { UI } from '../constants/messages';
import { ROUNDING_UNITS } from '../constants/split';
import type { RoundingUnit } from '../types/split';
import { SegmentedControl } from './SegmentedControl';

interface Props {
  unit: RoundingUnit;
  onChange: (unit: RoundingUnit) => void;
}

export function RoundingSelect({ unit, onChange }: Props) {
  return (
    <SegmentedControl
      groupLabel={UI.rounding.groupLabel}
      options={ROUNDING_UNITS.map((value) => ({ value, label: UI.rounding.option(value) }))}
      value={unit}
      onChange={onChange}
      size="sm"
    />
  );
}
