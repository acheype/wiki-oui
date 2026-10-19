"use client";

// The time of a Date / heure or Période (docs/forms.md § Saisie): one field,
// two segments. Each segment takes digits from the keyboard and opens its own
// menu below it — the 24 hours under the hour, the quarter hours under the
// minutes — and the arrow keys step an hour or a quarter hour. A minute off
// the quarters is typed, never refused. On a touch screen the device's own
// time picker does the job better than a menu under a finger.

import {
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { minutesOf } from "./clock";

type Segment = "hours" | "minutes";

const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour));
const QUARTERS = ["00", "15", "30", "45"];
/** Where an empty hour menu opens: the day, not the night. */
const FIRST_HOUR_SHOWN = "09";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function splitTime(value: string): { hours: string; minutes: string } {
  const [hours = "", minutes = ""] = value.split(":");
  return { hours, minutes };
}

// One digit at a time: a first digit that cannot start a two-digit value
// (3–9 for hours, 6–9 for minutes) completes the segment at once — « 9 » is
// 09 — and a second digit out of range is dropped.
function typedSegment(
  text: string,
  segment: Segment
): { value: string; complete: boolean } {
  const digits = text.replace(/\D/g, "").slice(0, 2);
  const firstMax = segment === "hours" ? 2 : 5;
  const max = segment === "hours" ? 23 : 59;
  if (digits.length === 0) return { value: "", complete: false };
  if (digits.length === 1) {
    return Number(digits) > firstMax
      ? { value: `0${digits}`, complete: true }
      : { value: digits, complete: false };
  }
  return Number(digits) <= max
    ? { value: digits, complete: true }
    : { value: digits[0], complete: false };
}

// ±1 hour, wrapping round midnight; ±1 quarter hour, from wherever the
// minutes are — 20 goes up to 30 and down to 15.
function stepped(value: string, segment: Segment, direction: 1 | -1): string {
  if (segment === "hours") {
    if (value === "") return FIRST_HOUR_SHOWN;
    return pad((Number(value) + direction + 24) % 24);
  }
  if (value === "") return "00";
  const minutes = Number(value);
  const quarter =
    direction === 1
      ? Math.floor(minutes / 15) * 15 + 15
      : Math.ceil(minutes / 15) * 15 - 15;
  return pad((quarter + 60) % 60);
}


/** `30 min`, `1h`, `1h30` — the length of a period that ends at an option. */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)}h${rest === 0 ? "" : pad(rest)}`;
}

function subscribeToPointer(onChange: () => void) {
  const query = window.matchMedia?.("(pointer: coarse)");
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

/** A finger rather than a mouse: phones and tablets. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeToPointer,
    () => window.matchMedia?.("(pointer: coarse)").matches ?? false,
    () => false
  );
}

export function TimeInput({
  id,
  label,
  value,
  invalid,
  durationFrom,
  onChange,
}: {
  id?: string;
  label: string;
  /** `HH:mm`, or unfinished while typed (`18:`). */
  value: string;
  invalid?: boolean;
  /** The start of a one-day period: the menus show each option's duration. */
  durationFrom?: string;
  onChange: (time: string) => void;
}) {
  const coarse = useCoarsePointer();
  if (coarse) {
    return (
      <Input
        id={id}
        type="time"
        step={60}
        aria-label={label}
        aria-invalid={invalid}
        className="w-28 tabular-nums"
        value={minutesOf(value) === null ? "" : value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <SegmentedTime
      id={id}
      label={label}
      value={value}
      invalid={invalid}
      durationFrom={durationFrom}
      onChange={onChange}
    />
  );
}

function SegmentedTime({
  id,
  label,
  value,
  invalid,
  durationFrom,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  invalid?: boolean;
  durationFrom?: string;
  onChange: (time: string) => void;
}) {
  const [parts, setParts] = useState(() => splitTime(value));
  // The segments lead while typing; a value changed from outside (the other
  // bound, a reset) takes over — adjusted during render, not in an effect.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setParts(splitTime(value));
  }
  // Handlers read the parts through a ref: completing the hour moves the
  // focus, and the hour's blur fires in that same event, before a re-render
  // could hand it the new parts.
  const latest = useRef(parts);
  useEffect(() => {
    latest.current = parts;
  }, [parts]);
  const [open, setOpen] = useState<Segment | null>(null);
  const inputs = { hours: useRef<HTMLInputElement>(null), minutes: useRef<HTMLInputElement>(null) };
  const listId = useId();

  const emit = (next: { hours: string; minutes: string }) => {
    latest.current = next;
    setParts(next);
    onChange(next.hours === "" && next.minutes === "" ? "" : `${next.hours}:${next.minutes}`);
  };

  const focus = (segment: Segment) => {
    inputs[segment].current?.focus();
    inputs[segment].current?.select();
  };

  const set = (segment: Segment, segmentValue: string) =>
    emit({ ...latest.current, [segment]: segmentValue });

  const pick = (segment: Segment, option: string) => {
    set(segment, option);
    if (segment === "hours") focus("minutes");
    else setOpen(null);
  };

  const onType = (segment: Segment, text: string) => {
    const { value: typed, complete } = typedSegment(text, segment);
    set(segment, typed);
    if (!complete) return;
    if (segment === "hours") focus("minutes");
    else setOpen(null);
  };

  const onKeyDown = (segment: Segment, event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowUp":
      case "ArrowDown":
        event.preventDefault();
        set(
          segment,
          stepped(latest.current[segment], segment, event.key === "ArrowUp" ? 1 : -1)
        );
        return;
      case "ArrowRight":
        if (segment === "hours") {
          event.preventDefault();
          focus("minutes");
        }
        return;
      case "ArrowLeft":
        if (segment === "minutes") {
          event.preventDefault();
          focus("hours");
        }
        return;
      case "Backspace":
        if (segment === "minutes" && latest.current.minutes === "") {
          event.preventDefault();
          focus("hours");
        }
        return;
      case "Enter":
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(null);
        }
        return;
    }
  };

  // A lone hour digit left behind is the hour it reads: « 7 » is 07.
  const onBlur = (segment: Segment) => {
    const typed = latest.current[segment];
    if (typed.length === 1) set(segment, `0${typed}`);
    setOpen((current) => (current === segment ? null : current));
  };

  const start = durationFrom ? minutesOf(durationFrom) : null;
  const optionsOf = (segment: Segment) =>
    (segment === "hours" ? HOURS : QUARTERS).map((option) => {
      if (start === null) return { option, duration: null, disabled: false };
      const hours = segment === "hours" ? option : parts.hours;
      const minutes =
        segment === "minutes" ? option : parts.minutes || durationFrom!.slice(3);
      const end = minutesOf(`${hours}:${minutes}`);
      // An hour stays open while one of its minutes can still end the period.
      const disabled =
        segment === "hours"
          ? Number(option) < Math.floor(start / 60)
          : end !== null && end <= start;
      const duration = end !== null && end > start ? formatDuration(end - start) : null;
      return { option, duration, disabled };
    });

  return (
    <div className="relative">
      <div
        role="group"
        aria-label={label}
        className={cn(
          "flex h-9 w-fit items-center rounded-md border border-input bg-transparent px-1.5 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          invalid &&
            "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40"
        )}
      >
        {(["hours", "minutes"] as const).map((segment) => (
          <SegmentInput
            key={segment}
            id={segment === "hours" ? id : undefined}
            inputRef={inputs[segment]}
            segment={segment}
            value={parts[segment]}
            expanded={open === segment}
            listId={listId}
            invalid={invalid}
            onFocus={() => {
              inputs[segment].current?.select();
              setOpen(segment);
            }}
            onClick={() => setOpen(segment)}
            onType={(text) => onType(segment, text)}
            onKeyDown={(event) => onKeyDown(segment, event)}
            onBlur={() => onBlur(segment)}
          />
        ))}
      </div>
      {open && (
        <TimeMenu
          id={listId}
          segment={open}
          selected={parts[open]}
          options={optionsOf(open)}
          onPick={(option) => pick(open, option)}
        />
      )}
    </div>
  );
}

function SegmentInput({
  id,
  inputRef,
  segment,
  value,
  expanded,
  listId,
  invalid,
  onFocus,
  onClick,
  onType,
  onKeyDown,
  onBlur,
}: {
  id?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  segment: Segment;
  value: string;
  expanded: boolean;
  listId: string;
  invalid?: boolean;
  onFocus: () => void;
  onClick: () => void;
  onType: (text: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}) {
  return (
    <>
      {segment === "minutes" && (
        <span aria-hidden className="px-0.5 text-muted-foreground">
          :
        </span>
      )}
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-label={segment === "hours" ? "Heures" : "Minutes"}
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && value !== "" ? `${listId}-${value}` : undefined}
        aria-invalid={invalid}
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        placeholder={segment === "hours" ? "hh" : "mm"}
        value={value}
        onFocus={onFocus}
        onClick={onClick}
        onChange={(event) => onType(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className="w-[3ch] rounded-sm bg-transparent py-0.5 text-center text-base tabular-nums outline-none placeholder:text-muted-foreground focus:bg-accent focus:text-accent-foreground md:text-sm"
      />
    </>
  );
}

function TimeMenu({
  id,
  segment,
  selected,
  options,
  onPick,
}: {
  id: string;
  segment: Segment;
  selected: string;
  options: { option: string; duration: string | null; disabled: boolean }[];
  onPick: (option: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // Open on the chosen value; else, in a period's end, on the first hour
  // still possible; else on the morning.
  const firstPossible = options.some((item) => item.disabled)
    ? options.find((item) => !item.disabled)?.option
    : undefined;
  const openedOn =
    selected !== ""
      ? selected
      : (firstPossible ?? (segment === "hours" ? FIRST_HOUR_SHOWN : ""));
  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-value="${openedOn}"]`);
    if (listRef.current && item) listRef.current.scrollTop = item.offsetTop;
  }, [openedOn]);
  const withDurations = options.some((item) => item.duration !== null);

  return (
    <div
      ref={listRef}
      id={id}
      role="listbox"
      aria-label={segment === "hours" ? "Heures" : "Minutes"}
      data-opened-on={openedOn}
      className={cn(
        "absolute top-full z-50 mt-1 flex max-h-56 flex-col overflow-y-auto rounded-md bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10",
        segment === "minutes" && "left-9",
        withDurations ? "min-w-24" : "min-w-12"
      )}
    >
      {options.map(({ option, duration, disabled }) => (
        <div
          key={option}
          id={`${id}-${option}`}
          data-value={option}
          role="option"
          aria-label={duration ? `${option}, ${duration}` : option}
          aria-selected={option === selected}
          aria-disabled={disabled}
          // Keep the focus in the segment: the menu is driven from there.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => !disabled && onPick(option)}
          className={cn(
            "flex cursor-pointer items-baseline justify-between gap-3 rounded-sm px-2 py-1 tabular-nums hover:bg-accent hover:text-accent-foreground",
            option === selected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            disabled && "pointer-events-none text-muted-foreground/50"
          )}
        >
          <span>{option}</span>
          {duration && (
            <span
              className={cn(
                "text-xs",
                option === selected ? "text-primary-foreground/80" : "text-muted-foreground"
              )}
            >
              {duration}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
