import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_NORMAL_COUNT,
  DEFAULT_ROUNDING_UNIT,
  DEFAULT_WEIGHTS,
  MAX_FIXED_ROWS,
  MAX_HEADCOUNT,
  emptyCounts,
  emptyMemos,
} from '../constants/split';
import { digitsToAmount } from '../lib/format';
import { countHeads } from '../lib/resultRows';
import type {
  FixedMember,
  LevelCounts,
  LevelId,
  LevelMemos,
  LevelWeights,
  RoundingUnit,
} from '../types/split';

/**
 * 入力状態はここに閉じ込める。
 * V1 では localStorage 等に保存しない（README「プライバシー設計」参照）。
 */
let idSeq = 0;
function createFixedMember(): FixedMember {
  idSeq += 1;
  return { id: `f${idSeq}`, name: '', amount: 0 };
}

function initialCounts(): LevelCounts {
  return { ...emptyCounts(), normal: DEFAULT_NORMAL_COUNT };
}

export function useSplitForm() {
  const [totalDigits, setTotalDigits] = useState('');
  const [counts, setCounts] = useState<LevelCounts>(initialCounts);
  const [weights, setWeights] = useState<LevelWeights>(() => ({ ...DEFAULT_WEIGHTS }));
  const [memos, setMemos] = useState<LevelMemos>(emptyMemos);
  // 固定金額は最初から1行だけ出しておく。空の行は計算では無視される。
  const [fixed, setFixed] = useState<FixedMember[]>(() => [createFixedMember()]);
  const [unit, setUnit] = useState<RoundingUnit>(DEFAULT_ROUNDING_UNIT);

  const total = useMemo(() => digitsToAmount(totalDigits), [totalDigits]);

  const activeFixed = useMemo(() => fixed.filter((member) => member.amount > 0), [fixed]);
  const headcount = useMemo(
    () => countHeads(counts) + activeFixed.length,
    [counts, activeFixed],
  );
  const canAdd = headcount < MAX_HEADCOUNT;

  const increment = useCallback(
    (level: LevelId) => {
      if (!canAdd) return;
      setCounts((current) => ({ ...current, [level]: (current[level] ?? 0) + 1 }));
    },
    [canAdd],
  );

  const decrement = useCallback((level: LevelId) => {
    setCounts((current) => ({ ...current, [level]: Math.max(0, (current[level] ?? 0) - 1) }));
  }, []);

  const setWeight = useCallback((level: LevelId, weight: number) => {
    setWeights((current) => ({ ...current, [level]: weight }));
  }, []);

  const resetWeight = useCallback((level: LevelId) => {
    setWeights((current) => ({ ...current, [level]: DEFAULT_WEIGHTS[level] }));
  }, []);

  const setMemo = useCallback((level: LevelId, memo: string) => {
    setMemos((current) => ({ ...current, [level]: memo }));
  }, []);

  const addFixed = useCallback(() => {
    setFixed((current) => (current.length >= MAX_FIXED_ROWS ? current : [...current, createFixedMember()]));
  }, []);

  const updateFixed = useCallback((id: string, patch: Partial<FixedMember>) => {
    setFixed((current) =>
      current.map((member) => (member.id === id ? { ...member, ...patch } : member)),
    );
  }, []);

  /** 行は0個にできる（固定金額を使わない飲み会のほうが多いため） */
  const removeFixed = useCallback((id: string) => {
    setFixed((current) => current.filter((member) => member.id !== id));
  }, []);

  const reset = useCallback(() => {
    setTotalDigits('');
    setCounts(initialCounts());
    setWeights({ ...DEFAULT_WEIGHTS });
    setMemos(emptyMemos());
    setFixed([createFixedMember()]);
    setUnit(DEFAULT_ROUNDING_UNIT);
  }, []);

  return {
    totalDigits,
    setTotalDigits,
    total,
    counts,
    weights,
    memos,
    fixed,
    unit,
    setUnit,
    increment,
    decrement,
    setWeight,
    resetWeight,
    setMemo,
    addFixed,
    updateFixed,
    removeFixed,
    reset,
    headcount,
    fixedCount: activeFixed.length,
    canAdd,
    canAddFixed: fixed.length < MAX_FIXED_ROWS,
  };
}

export type SplitForm = ReturnType<typeof useSplitForm>;
