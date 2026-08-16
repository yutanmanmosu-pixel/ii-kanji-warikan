import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LevelId, RoundingUnit } from '../../types/split';
import type { OrganizerEvent, OrganizerParticipant } from '../types';
import {
  createEvent,
  createParticipant,
  duplicateEvent,
  isStorageAvailable,
  loadStore,
  MAX_PARTICIPANTS,
  saveStore,
} from '../lib/storage';

/**
 * 飲み会データの読み書きをここに集約する。
 * コンポーネント側から localStorage を直接触らせないことで、
 * 保存方法を将来変えるときの影響範囲をこのファイルだけにする。
 */
export function useOrganizerEvents() {
  const [events, setEvents] = useState<OrganizerEvent[]>(() => loadStore().events);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [storageOk] = useState(isStorageAvailable);
  const isFirstRender = useRef(true);

  // 変更があるたびに保存する。件数が少ないので debounce は不要。
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveStore({ version: 1, events });
  }, [events]);

  const current = useMemo(
    () => events.find((event) => event.id === currentId) ?? null,
    [events, currentId],
  );

  /** 対象の飲み会だけを書き換え、更新日時を進める */
  const updateEvent = useCallback((id: string, updater: (event: OrganizerEvent) => OrganizerEvent) => {
    setEvents((current) =>
      current.map((event) =>
        event.id === id ? { ...updater(event), updatedAt: new Date().toISOString() } : event,
      ),
    );
  }, []);

  const updateCurrent = useCallback(
    (updater: (event: OrganizerEvent) => OrganizerEvent) => {
      if (!currentId) return;
      updateEvent(currentId, updater);
    },
    [currentId, updateEvent],
  );

  const addEvent = useCallback((name: string) => {
    const event = createEvent(name);
    setEvents((current) => [event, ...current]);
    setCurrentId(event.id);
    return event.id;
  }, []);

  const removeEvent = useCallback(
    (id: string) => {
      setEvents((current) => current.filter((event) => event.id !== id));
      setCurrentId((value) => (value === id ? null : value));
    },
    [],
  );

  const copyEvent = useCallback((id: string, name: string) => {
    setEvents((current) => {
      const source = current.find((event) => event.id === id);
      if (!source) return current;
      return [duplicateEvent(source, name), ...current];
    });
  }, []);

  const renameEvent = useCallback(
    (id: string, name: string) => updateEvent(id, (event) => ({ ...event, name })),
    [updateEvent],
  );

  /* ------------------------- 名簿の操作 ------------------------- */

  const setParticipants = useCallback(
    (updater: (participants: OrganizerParticipant[]) => OrganizerParticipant[]) => {
      updateCurrent((event) => ({ ...event, participants: updater(event.participants) }));
    },
    [updateCurrent],
  );

  const addParticipant = useCallback(
    (name: string) => {
      setParticipants((participants) =>
        participants.length >= MAX_PARTICIPANTS
          ? participants
          : [...participants, createParticipant(name)],
      );
    },
    [setParticipants],
  );

  const addParticipants = useCallback(
    (incoming: OrganizerParticipant[], mode: 'replace' | 'append') => {
      setParticipants((participants) => {
        const base = mode === 'replace' ? [] : participants;
        return [...base, ...incoming].slice(0, MAX_PARTICIPANTS);
      });
    },
    [setParticipants],
  );

  const updateParticipant = useCallback(
    (id: string, patch: Partial<OrganizerParticipant>) => {
      setParticipants((participants) =>
        participants.map((participant) =>
          participant.id === id ? { ...participant, ...patch } : participant,
        ),
      );
    },
    [setParticipants],
  );

  const removeParticipant = useCallback(
    (id: string) => {
      setParticipants((participants) => participants.filter((participant) => participant.id !== id));
    },
    [setParticipants],
  );

  /** 並び替え。スマホでも確実に動くよう、ドラッグではなく1つずつ動かす。 */
  const moveParticipant = useCallback(
    (id: string, direction: -1 | 1) => {
      setParticipants((participants) => {
        const index = participants.findIndex((participant) => participant.id === id);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= participants.length) return participants;
        const next = [...participants];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved);
        return next;
      });
    },
    [setParticipants],
  );

  /**
   * 回収済みにする。このときの徴収予定額を「実際に受け取った額」として記録する。
   * あとで会計金額を変えても、この額は書き換えない。
   */
  const setCollected = useCallback(
    (id: string, collected: boolean, dueAmount: number) => {
      updateParticipant(id, {
        collected,
        collectedAt: collected ? new Date().toISOString() : null,
        collectedAmount: collected ? Math.max(0, Math.floor(dueAmount)) : null,
      });
    },
    [updateParticipant],
  );

  /** 差額をやりとりして、受け取った額をいまの徴収予定額に合わせる */
  const settleDifference = useCallback(
    (id: string, dueAmount: number) => {
      updateParticipant(id, {
        collected: true,
        collectedAt: new Date().toISOString(),
        collectedAmount: Math.max(0, Math.floor(dueAmount)),
      });
    },
    [updateParticipant],
  );

  const resetCollected = useCallback(() => {
    setParticipants((participants) =>
      participants.map((participant) => ({
        ...participant,
        collected: false,
        collectedAt: null,
        collectedAmount: null,
      })),
    );
  }, [setParticipants]);

  const setLevel = useCallback(
    (id: string, level: LevelId) => updateParticipant(id, { level }),
    [updateParticipant],
  );

  const setTotalAmount = useCallback(
    (totalAmount: number) => updateCurrent((event) => ({ ...event, totalAmount })),
    [updateCurrent],
  );

  const setRoundingUnit = useCallback(
    (roundingUnit: RoundingUnit) => updateCurrent((event) => ({ ...event, roundingUnit })),
    [updateCurrent],
  );

  const setWeight = useCallback(
    (level: LevelId, weight: number) =>
      updateCurrent((event) => ({ ...event, weights: { ...event.weights, [level]: weight } })),
    [updateCurrent],
  );

  return {
    events,
    current,
    storageOk,
    openEvent: setCurrentId,
    closeEvent: () => setCurrentId(null),
    addEvent,
    removeEvent,
    copyEvent,
    renameEvent,
    setName: (name: string) => updateCurrent((event) => ({ ...event, name })),
    setTotalAmount,
    setRoundingUnit,
    setWeight,
    addParticipant,
    addParticipants,
    updateParticipant,
    removeParticipant,
    moveParticipant,
    setCollected,
    settleDifference,
    resetCollected,
    setLevel,
  };
}

export type OrganizerState = ReturnType<typeof useOrganizerEvents>;
