import { useCallback, useEffect, useRef, useState } from "react";

type RowKey = string | number;
type RowInteractionOptions<T extends RowKey> = { keys: T[]; onOpen?: (key: T) => void; onSelectionChange?: (keys: T[]) => void };

export function useRowInteraction<T extends RowKey>(input: T[] | RowInteractionOptions<T>, callback?: (key: T) => void) {
  const keys = Array.isArray(input) ? input : input.keys;
  const onOpen = Array.isArray(input) ? callback : input.onOpen;
  const onSelectionChange = Array.isArray(input) ? undefined : input.onSelectionChange;
  const [selected, setSelected] = useState<T[]>([]);
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    setSelected(current => {
      const next = current.filter(key => keys.includes(key));
      const unchanged = next.length === current.length && next.every((key, index) => key === current[index]);
      if (unchanged) return current;
      anchor.current = null;
      return next;
    });
  }, [keys]);

  const clear = useCallback(() => {
    setSelected([]);
    onSelectionChange?.([]);
    anchor.current = null;
  }, [onSelectionChange]);

  const select = useCallback((key: T, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const index = keys.indexOf(key);
    if (index < 0) return;
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey && anchor.current !== null) {
      const start = Math.min(anchor.current, index);
      const end = Math.max(anchor.current, index);
      const next = keys.slice(start, end + 1); setSelected(next); onSelectionChange?.(next);
    } else if (additive) {
      setSelected(current => { const next = current.includes(key) ? current.filter(item => item !== key) : [...current, key]; onSelectionChange?.(next); return next; });
      anchor.current = index;
    } else {
      setSelected([key]); onSelectionChange?.([key]);
      anchor.current = index;
    }
  }, [keys, onSelectionChange]);

  const open = useCallback((key: T) => onOpen?.(key), [onOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clear]);

  const getRowProps = useCallback((key: T) => ({ onClick: (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => select(key, event), onDoubleClick: () => open(key) }), [open, select]);
  return { selected, select, open, clear, getRowProps, isSelected: (key: T) => selected.includes(key) };
}
