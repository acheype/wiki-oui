"use client";

// The entry widgets of Date / heure and Période (docs/forms.md § Saisie). The
// date comes from a date picker; the time is typed to the minute or picked in
// two columns, hours and quarter hours. « Toute la journée » leaves the time
// out; unchecked, a date with no time yet travels as `yyyy-mm-ddT`, so the
// derived schema asks for the time instead of reading the date as all day.

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useId, useState } from "react";
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
import { TimeInput } from "./time-input";

/** A bound as the widgets edit it: its two parts, each possibly unfinished. */
interface BoundDraft {
  date: string;
  time: string;
}

function splitBound(value: string): BoundDraft {
  if (/^\d{2}:\d{2}$/.test(value)) return { date: "", time: value };
  const [date = "", time = ""] = value.split("T");
  return { date, time };
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
  const [allDay, setAllDay] = useState(() => initiallyAllDay(settings, range.start));
  const drafts = { start: splitBound(range.start), end: splitBound(range.end) };
  const labelId = useId();
  // The end's time menu counts from the start when both fall on one day.
  const sameDay =
    resolvedFormat(settings) === "time" || drafts.start.date === drafts.end.date;
  const durationFrom =
    sameDay && /^\d{2}:\d{2}$/.test(drafts.start.time) ? drafts.start.time : undefined;

  const emit = (next: { start: BoundDraft; end: BoundDraft }, nextAllDay: boolean) => {
    const start = joinBound(next.start, settings, nextAllDay);
    const end = joinBound(next.end, settings, nextAllDay);
    // Both bounds emptied: the Période has no value at all, never half of one.
    onChange(start === "" && end === "" ? undefined : { start, end });
  };

  const setStart = (start: BoundDraft) => {
    // Picking a start with no end yet makes a one-day period: one click for
    // the most common case.
    const end =
      drafts.end.date === "" && start.date !== drafts.start.date
        ? { ...drafts.end, date: start.date }
        : drafts.end;
    emit({ start, end }, allDay);
  };

  return (
    <div className="grid gap-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="sr-only">
        Période
      </span>
      {(["start", "end"] as const).map((bound) => (
        <div key={bound} className="flex flex-wrap items-center gap-2">
          <span className="w-10 text-sm text-muted-foreground">
            {bound === "start" ? "Début" : "Fin"}
          </span>
          <BoundInputs
            id={bound === "start" ? id : undefined}
            draft={drafts[bound]}
            settings={settings}
            allDay={allDay}
            labels={
              bound === "start"
                ? { date: "Date de début", time: "Heure de début" }
                : { date: "Date de fin", time: "Heure de fin" }
            }
            invalid={invalid}
            defaultMonth={bound === "end" ? drafts.start.date || undefined : undefined}
            notBefore={bound === "end" ? drafts.start.date || undefined : undefined}
            durationFrom={bound === "end" ? durationFrom : undefined}
            onChange={(next) =>
              bound === "start" ? setStart(next) : emit({ ...drafts, end: next }, allDay)
            }
          />
        </div>
      ))}
      {timeIsOptional(settings) && (
        <AllDayBox
          checked={allDay}
          onChange={(checked) => {
            setAllDay(checked);
            emit(drafts, checked);
          }}
        />
      )}
    </div>
  );
}
