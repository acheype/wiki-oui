"use client";

// The entry widgets of Date / heure and Période (docs/forms.md § Saisie). The
// date comes from a date picker; the time is typed to the minute or picked in
// two columns, hours and quarter hours. « Toute la journée » leaves the time
// out; unchecked, a date with no time yet travels as `yyyy-mm-ddT`, so the
// derived schema asks for the time instead of reading the date as all day.

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  type TemporalRange,
  type TemporalSettings,
  isTemporalRange,
  resolvedFormat,
  timeIsOptional,
} from "../temporal-value/formats";
import { formatTemporalValue } from "../temporal-value";
import { daysBetween, shiftDay } from "@/lib/day";
import { minutesOf, shiftTime } from "./clock";
import { TimeInput } from "./time-input";

/** A bound as the widgets edit it: its two parts, each possibly unfinished. */
interface BoundDraft {
  date: string;
  time: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// A bound is a date only when it starts with one: a time typed before any
// date — even half typed, « 1: » — stays a time.
function splitBound(value: string): BoundDraft {
  const [head = "", rest] = value.split("T");
  if (rest !== undefined) return { date: head, time: rest };
  return DAY.test(head) ? { date: head, time: "" } : { date: "", time: head };
}

// What a bound stores: the time is left out all day, and awaited (`date` +
// "T") while « Toute la journée » is unchecked and no time is entered yet.
function joinBound(
  { date, time }: BoundDraft,
  settings: TemporalSettings,
  allDay: boolean
): string {
  switch (resolvedFormat(settings)) {
    case "date":
      return date;
    case "time":
      return time;
    case "datetime":
      if (date === "") return time;
      return allDay ? date : `${date}T${time}`;
  }
}

/* ------------------------------------------------------------------ *
 * The two bricks
 * ------------------------------------------------------------------ */

function DatePicker({
  id,
  label,
  value,
  invalid,
  defaultMonth,
  notBefore,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  invalid?: boolean;
  defaultMonth?: string;
  notBefore?: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const valid = selected && !Number.isNaN(selected.getTime()) ? selected : undefined;
  const month = valid ?? (defaultMonth ? new Date(`${defaultMonth}T00:00:00`) : undefined);
  const text = valid ? format(valid, "d MMMM yyyy", { locale: fr }) : "Choisir une date";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={valid ? `${label}, ${text}` : label}
            aria-invalid={invalid}
            className={cn(
              "w-52 justify-start font-normal",
              !valid && "text-muted-foreground"
            )}
          />
        }
      >
        <CalendarIcon className="size-4" aria-hidden />
        {text}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={fr}
          selected={valid}
          defaultMonth={month}
          disabled={notBefore ? { before: new Date(`${notBefore}T00:00:00`) } : undefined}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function AllDayBox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Label className="flex items-center gap-2 font-normal">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      Toute la journée
    </Label>
  );
}

/** One bound's controls: a date picker, a time input, or both. */
function BoundInputs({
  id,
  draft,
  settings,
  allDay,
  labels,
  invalid,
  defaultMonth,
  notBefore,
  durationFrom,
  onChange,
}: {
  id?: string;
  draft: BoundDraft;
  settings: TemporalSettings;
  allDay: boolean;
  labels: { date: string; time: string };
  invalid?: boolean;
  defaultMonth?: string;
  notBefore?: string;
  durationFrom?: string;
  onChange: (draft: BoundDraft) => void;
}) {
  const mode = resolvedFormat(settings);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode !== "time" && (
        <DatePicker
          id={id}
          label={labels.date}
          value={draft.date}
          invalid={invalid}
          defaultMonth={defaultMonth}
          notBefore={notBefore}
          onChange={(date) => onChange({ ...draft, date })}
        />
      )}
      {(mode === "time" || (mode === "datetime" && !allDay)) && (
        <TimeInput
          id={mode === "time" ? id : undefined}
          label={labels.time}
          value={draft.time}
          invalid={invalid}
          durationFrom={durationFrom}
          onChange={(time) => onChange({ ...draft, time })}
        />
      )}
    </div>
  );
}

// A stored date alone reads as « Toute la journée »; an empty value starts
// unchecked, the box's default.
function initiallyAllDay(settings: TemporalSettings, bound: string): boolean {
  if (!timeIsOptional(settings)) return false;
  const { date, time } = splitBound(bound);
  return date !== "" && time === "" && !bound.endsWith("T");
}

/* ------------------------------------------------------------------ *
 * The two widgets
 * ------------------------------------------------------------------ */

export function DateTimeInput({
  id,
  value,
  settings,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  settings: TemporalSettings;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [allDay, setAllDay] = useState(() => initiallyAllDay(settings, value));
  const draft = splitBound(value);
  const emit = (next: BoundDraft, nextAllDay: boolean) =>
    onChange(joinBound(next, settings, nextAllDay));

  return (
    <div className="grid gap-2">
      <BoundInputs
        id={id}
        draft={draft}
        settings={settings}
        allDay={allDay}
        labels={{ date: "Date", time: "Heure" }}
        invalid={invalid}
        onChange={(next) => emit(next, allDay)}
      />
      {timeIsOptional(settings) && (
        <AllDayBox
          checked={allDay}
          onChange={(checked) => {
            setAllDay(checked);
            emit(draft, checked);
          }}
        />
      )}
    </div>
  );
}

const EMPTY_RANGE: TemporalRange = { start: "", end: "" };

function dateOf(day: string): Date {
  return new Date(`${day}T00:00:00`);
}

function isoOf(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * The calendar of a period over several days. A first click moves the whole
 * period, keeping its length — the end follows the start; a second click,
 * if any, sets the last day, never before the first. Hovering previews the
 * period the second click would make.
 */
function RangePicker({
  id,
  start,
  end,
  invalid,
  onChange,
}: {
  id?: string;
  start: string;
  end: string;
  invalid?: boolean;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  /** The first day clicked during this opening, awaiting the last one. */
  const [first, setFirst] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const filled = DAY.test(start) && DAY.test(end);
  const text = filled ? formatTemporalValue({ start, end }) : "Choisir les dates";
  const length = filled ? Math.max(daysBetween(start, end), 0) : 0;

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setFirst(null);
      setHovered(null);
    }
  };

  const pick = (date: Date) => {
    const day = isoOf(date);
    if (first === null) {
      onChange(day, shiftDay(day, length));
      setFirst(day);
      return;
    }
    onChange(first, day);
    close(false);
  };

  const preview =
    first !== null && hovered !== null && hovered >= first
      ? { from: dateOf(first), to: dateOf(hovered) }
      : undefined;

  return (
    <Popover open={open} onOpenChange={close}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={filled ? `Dates, ${text}` : "Dates"}
            aria-invalid={invalid}
            className={cn("w-fit min-w-52 justify-start font-normal", !filled && "text-muted-foreground")}
          />
        }
      >
        <CalendarIcon className="size-4" aria-hidden />
        {text}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          locale={fr}
          selected={filled ? { from: dateOf(start), to: dateOf(end) } : undefined}
          defaultMonth={filled ? dateOf(start) : undefined}
          disabled={first !== null ? { before: dateOf(first) } : undefined}
          onSelect={(_, triggerDate) => pick(triggerDate)}
          onDayMouseEnter={(date) => setHovered(isoOf(date))}
          onDayMouseLeave={() => setHovered(null)}
          modifiers={preview ? { preview } : undefined}
          modifiersClassNames={{ preview: "bg-accent/70" }}
        />
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          {first === null
            ? "Choisissez le premier jour."
            : "Choisissez le dernier jour, ou fermez pour garder la durée."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** « le 16 », « le 1er » — the day of a date, as a time's companion. */
function dayOfMonth(date: string): string {
  const day = Number(date.slice(8, 10));
  return `le ${day === 1 ? "1er" : day}`;
}

function MultiDayBox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Label className="flex items-center gap-2 font-normal">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      Sur plusieurs jours
    </Label>
  );
}

/**
 * A Période, entered one day first: most periods hold in a day, so a single
 * date and a « de … à … » time pair is the default, and « Sur plusieurs
 * jours » switches to the period calendar. The boxes come first, since they
 * change what the fields below them look like.
 */
export function PeriodInput({
  id,
  value,
  settings,
  invalid,
  onChange,
}: {
  id: string;
  value: unknown;
  settings: TemporalSettings;
  invalid?: boolean;
  onChange: (value: TemporalRange | undefined) => void;
}) {
  const range = isTemporalRange(value) ? value : EMPTY_RANGE;
  const mode = resolvedFormat(settings);
  const drafts = { start: splitBound(range.start), end: splitBound(range.end) };
  const [allDay, setAllDay] = useState(() => initiallyAllDay(settings, range.start));
  const [multiDay, setMultiDay] = useState(
    () =>
      drafts.start.date !== "" &&
      drafts.end.date !== "" &&
      drafts.start.date !== drafts.end.date
  );
  const labelId = useId();
  const showTimes = mode === "time" || (mode === "datetime" && !allDay);
  const oneDay = mode === "time" || !multiDay;
  // The end's time menu counts from the start when both fall on one day.
  const durationFrom =
    oneDay && minutesOf(drafts.start.time) !== null ? drafts.start.time : undefined;

  const emit = (next: { start: BoundDraft; end: BoundDraft }, nextAllDay = allDay) => {
    const start = joinBound(next.start, settings, nextAllDay);
    const end = joinBound(next.end, settings, nextAllDay);
    // Both bounds emptied: the Période has no value at all, never half of one.
    onChange(start === "" && end === "" ? undefined : { start, end });
  };

  // Within one day the end follows the start, keeping the duration — as
  // agendas do — and an end with no time yet gets the start + 1h, as long as
  // it stays within the day. The duration counts from the last complete start
  // time: typing 18:30 passes through 18:00 and the unfinished 18:3.
  const lastStart = useRef(minutesOf(drafts.start.time));
  const setStartTime = (time: string) => {
    let end = drafts.end;
    const startMinutes = minutesOf(time);
    if (oneDay && startMinutes !== null) {
      const previousStart = lastStart.current;
      const previousEnd = minutesOf(drafts.end.time);
      const duration =
        previousStart !== null && previousEnd !== null && previousEnd > previousStart
          ? previousEnd - previousStart
          : 60;
      if (previousEnd === null || previousStart !== null || previousEnd <= startMinutes) {
        end = { ...end, time: shiftTime(time, duration) ?? end.time };
      }
      lastStart.current = startMinutes;
    }
    emit({ start: { ...drafts.start, time }, end });
  };

  const setOneDay = (date: string) =>
    emit({ start: { ...drafts.start, date }, end: { ...drafts.end, date } });

  const toggleMultiDay = (checked: boolean) => {
    setMultiDay(checked);
    if (checked) return;
    // Back to one day: the end returns to the start's day, and an end time
    // now before the start becomes the start + 1h.
    let end = { ...drafts.end, date: drafts.start.date };
    const startMinutes = minutesOf(drafts.start.time);
    const endMinutes = minutesOf(end.time);
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      end = { ...end, time: shiftTime(drafts.start.time, 60) ?? "" };
    }
    emit({ start: drafts.start, end });
  };

  const startTime = (
    <TimeInput
      id={mode === "time" ? id : undefined}
      label="Heure de début"
      value={drafts.start.time}
      invalid={invalid}
      onChange={setStartTime}
    />
  );
  const endTime = (
    <TimeInput
      label="Heure de fin"
      value={drafts.end.time}
      invalid={invalid}
      durationFrom={durationFrom}
      onChange={(time) => emit({ ...drafts, end: { ...drafts.end, time } })}
    />
  );
  const joiner = (text: string) => (
    <span className="text-sm text-muted-foreground">{text}</span>
  );

  return (
    <div className="grid gap-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="sr-only">
        Période
      </span>
      {(timeIsOptional(settings) || mode !== "time") && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {timeIsOptional(settings) && (
            <AllDayBox
              checked={allDay}
              onChange={(checked) => {
                setAllDay(checked);
                emit(drafts, checked);
              }}
            />
          )}
          {mode !== "time" && (
            <MultiDayBox checked={multiDay} onChange={toggleMultiDay} />
          )}
        </div>
      )}
      {/* One line, wrapping only between whole « de … » and « à … » blocks.
          Over several days each time is followed by its day: « de 18:30 à
          19:30 » alone would read as a daily schedule. */}
      <div className="flex flex-wrap items-center gap-2">
        {mode === "time" ? null : oneDay ? (
          <DatePicker
            id={id}
            label="Date"
            value={drafts.start.date}
            invalid={invalid}
            onChange={setOneDay}
          />
        ) : (
          <RangePicker
            id={id}
            start={drafts.start.date}
            end={drafts.end.date}
            invalid={invalid}
            onChange={(start, end) =>
              emit({ start: { ...drafts.start, date: start }, end: { ...drafts.end, date: end } })
            }
          />
        )}
        {showTimes && (
          <>
            <span className="flex items-center gap-2">
              {mode !== "time" && joiner("de")}
              {startTime}
              {!oneDay && DAY.test(drafts.start.date) && joiner(dayOfMonth(drafts.start.date))}
            </span>
            <span className="flex items-center gap-2">
              {joiner("à")}
              {endTime}
              {!oneDay && DAY.test(drafts.end.date) && joiner(dayOfMonth(drafts.end.date))}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
