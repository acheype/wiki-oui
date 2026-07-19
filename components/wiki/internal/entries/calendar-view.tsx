"use client";

// Calendrier (docs/entries-view.md): the temporal grid — FullCalendar
// (month / week / day, plus the Planning list views), French locale,
// events colored by colorField, click applying entryDisplay. Without a
// start-date field the view states its requirement explicitly.

import frLocale from "@fullcalendar/core/locales/fr";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
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
        ...(color ? { backgroundColor: color, borderColor: color } : {}),
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
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
        locale={frLocale}
        initialView={initialView}
        events={events}
        height="auto"
        headerToolbar={
          compact
            ? { left: "prev,next", center: "title", right: "" }
            : {
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay,listYear",
              }
        }
        buttonText={{ listYear: "Planning" }}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          context.openEntry(info.event.id);
        }}
        eventClassNames="cursor-pointer"
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
