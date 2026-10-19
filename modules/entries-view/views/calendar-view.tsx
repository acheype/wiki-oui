"use client";

// Calendrier (docs/entries-view.md): the temporal grid — FullCalendar 7
// (month / week / day, plus the Planning list views), French locale, events
// colored by colorField, click applying entryDisplay. The forma theme is
// restyled onto WikiOui's design tokens in globals.css (.entries-calendar).
// Without a date field the view states its requirement explicitly. A value
// with a time sits at its hour in the week and day grids; one without lies in
// the all-day row (docs/entries-view.md).

import { Calendar } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import listPlugin from "@fullcalendar/react/list";
import frLocale from "@fullcalendar/react/locales/fr";
import formaTheme from "@fullcalendar/react/themes/forma";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/forma/theme.css";
import { useRef } from "react";
import { entryValue } from "../core/rules";
import {
  type TemporalSpan,
  formatTemporalValue,
  temporalSpan,
} from "@/modules/forms/temporal-value";
import { cn } from "@/lib/utils";
import { HOVER_PRELOAD_MS } from "@/modules/pages/page-modal";
import type { ViewContext } from "./types";

const INITIAL_VIEWS: Record<string, string> = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  day: "timeGridDay",
};

const PLANNING_VIEWS: Record<string, string> = {
  year: "listYear",
  month: "listMonth",
  week: "listWeek",
};

export function CalendarView({ context }: { context: ViewContext }) {
  const { entries, props } = context;
  // FullCalendar events are not React components, so the sweep debounce is one
  // shared timer here rather than per-row handlers (ADR 0022).
  const preloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateField = props.dateField;

  if (!dateField) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Le Calendrier attend un champ de date.
      </p>
    );
  }

  const events = entries.flatMap((entry) => {
    const span = temporalSpan(entryValue(entry, dateField));
    if (!span) return [];
    const color = context.colorOf(entry);
    return [
      {
        id: entry.slug,
        title: entry.title,
        start: span.start,
        ...eventEnd(span),
        allDay: span.allDay,
        ...(color ? { color } : {}),
      },
    ];
  });

  const initialView =
    props.initialView === "planning"
      ? PLANNING_VIEWS[props.planningRange ?? "year"]
      : INITIAL_VIEWS[props.initialView ?? "month"];

  const compact = props.compact === true;

  return (
    <div
      className={cn(
        "entries-calendar",
        compact && "entries-calendar-compact text-xs"
      )}
    >
      <Calendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, formaTheme]}
        locale={frLocale}
        initialView={initialView}
        events={events}
        height="auto"
        headerToolbar={
          compact
            ? { start: "prev,next", center: "title", end: "" }
            : {
                start: "prev,next today",
                center: "title",
                end: "dayGridMonth,timeGridWeek,timeGridDay,listYear",
              }
        }
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          context.openEntry(info.event.id);
        }}
        eventMouseEnter={(info) => {
          if (preloadTimer.current) clearTimeout(preloadTimer.current);
          preloadTimer.current = setTimeout(
            () => context.preloadEntry(info.event.id),
            HOVER_PRELOAD_MS
          );
        }}
        eventMouseLeave={() => {
          if (preloadTimer.current) {
            clearTimeout(preloadTimer.current);
            preloadTimer.current = null;
          }
        }}
        eventClass="cursor-pointer"
        eventTimeFormat={({ date }) =>
          formatTemporalValue(`${pad(date.hour)}:${pad(date.minute)}`)
        }
        dayMaxEventRows={compact ? 2 : undefined}
      />
    </div>
  );
}

// FullCalendar's all-day end is exclusive: a stored end date is the event's
// last day, so it shifts by one. A timed end is an instant, taken as it is.
function eventEnd(span: TemporalSpan) {
  if (span.end <= span.start) return {};
  return { end: span.allDay ? nextDay(span.end) : span.end };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
