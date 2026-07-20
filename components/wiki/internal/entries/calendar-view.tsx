"use client";

// Calendrier (docs/entries-view.md): the temporal grid — FullCalendar 7
// (month / week / day, plus the Planning list views), French locale, events
// colored by colorField, click applying entryDisplay. The forma theme is
// restyled onto WikiOui's design tokens in globals.css (.entries-calendar).
// Without a start-date field the view states its requirement explicitly.

import { Calendar } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import listPlugin from "@fullcalendar/react/list";
import frLocale from "@fullcalendar/react/locales/fr";
import formaTheme from "@fullcalendar/react/themes/forma";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/forma/theme.css";
import { entryDay, entryValue } from "@/lib/entries-view";
import { cn } from "@/lib/utils";
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
  const startField = props.startDateField;

  if (!startField) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Le Calendrier attend un champ date de début.
      </p>
    );
  }

  const events = entries.flatMap((entry) => {
    const start = entryDay(entryValue(entry, startField));
    if (!start) return [];
    const end = props.endDateField
      ? entryDay(entryValue(entry, props.endDateField))
      : null;
    const color = context.colorOf(entry);
    return [
      {
        id: entry.slug,
        title: entry.title,
        start,
        // FullCalendar's all-day end is exclusive; a stored end date is the
        // event's last day, so it shifts by one.
        ...(end && end > start ? { end: nextDay(end) } : {}),
        allDay: true,
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
        eventClass="cursor-pointer"
        dayMaxEventRows={compact ? 2 : undefined}
      />
    </div>
  );
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
