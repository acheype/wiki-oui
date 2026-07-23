import Link from "next/link";
import { Prose } from "@/components/page/prose";
import { DEFAULT_IMAGE_WIDTH, imageUrl } from "@/lib/image-url";
import { renderMdx } from "@/lib/mdx";
import {
  type EntryData,
  type FormDescriptor,
  type FormField,
  isOptionsField,
} from "@/lib/form-descriptor";
import { EntryMap } from "./entry-map-lazy";

// Default entry render (docs/forms.md): a title in h1, then each field by its
// type. Used when the form has no template. Server component; the map piece
// is client-only (entry-map-lazy holds the `ssr: false` boundary).

export async function EntryView({
  descriptor,
  data,
  linkTitles,
  hideTitle = false,
}: {
  descriptor: FormDescriptor;
  data: EntryData;
  /** slug → current title, for form-sourced option values (wiki links). */
  linkTitles: Record<string, string>;
  /** Set by a container that already names the entry (see EntryContent). */
  hideTitle?: boolean;
}) {
  // Read, never recomputed (ADR 0020): the title is stored in `data` like
  // any other field value, automatic mode included.
  const title = typeof data.title === "string" ? data.title : "";
  const rows = await Promise.all(
    descriptor.fields.map(async (field) => {
      if (field.type === "title") return null;
      const rendered = await renderField(field, data, linkTitles);
      if (rendered === null) return null;
      return { field, rendered };
    })
  );
  return (
    <div>
      {!hideTitle && (
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">{title}</h1>
      )}
      <dl className="grid gap-5">
        {rows.map(
          (row) =>
            row && (
              <div key={row.field.name} className="grid gap-1">
                {row.field.type !== "customContent" && (
                  <dt className="text-sm font-medium text-muted-foreground">
                    {row.field.label}
                  </dt>
                )}
                <dd>{row.rendered}</dd>
              </div>
            )
        )}
      </dl>
    </div>
  );
}

async function renderField(
  field: FormField,
  data: EntryData,
  linkTitles: Record<string, string>
): Promise<React.ReactNode> {
  const value = data[field.name];

  switch (field.type) {
    case "customContent":
      return field.displayContent ? (
        <Prose>{await renderMdx(field.displayContent)}</Prose>
      ) : null;
    case "email":
      return isEmpty(value) ? null : (
        <a href={`mailto:${value}`} className="text-primary underline">
          {String(value)}
        </a>
      );
    case "url":
      return isEmpty(value) ? null : (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
        >
          {String(value)}
        </a>
      );
    case "date":
      return isEmpty(value) ? null : localizedDate(String(value));
    case "textarea":
      if (isEmpty(value)) return null;
      return field.allowMdx ? (
        <Prose>{await renderMdx(String(value))}</Prose>
      ) : (
        <p className="whitespace-pre-line">{String(value)}</p>
      );
    case "image": {
      if (isEmpty(value)) return null;
      // Honor the field's configured display box (docs/forms.md); default to
      // a page-width bound when neither dimension is set.
      const box =
        field.resizeWidth || field.resizeHeight
          ? { width: field.resizeWidth, height: field.resizeHeight }
          : { width: DEFAULT_IMAGE_WIDTH };
      return (
        // eslint-disable-next-line @next/next/no-img-element -- pool file, resize API
        <img
          src={imageUrl(String(value), box)}
          alt=""
          className="h-auto max-w-full rounded-md"
        />
      );
    }
    case "file":
      return isEmpty(value) ? null : (
        <a
          href={`/api/files/${encodeURIComponent(String(value))}`}
          className="text-primary underline"
        >
          {String(value)}
        </a>
      );
    case "geolocation": {
      const point = readPoint(value);
      return point ? <EntryMap lat={point.lat} lng={point.lng} /> : null;
    }
    case "tags": {
      const tags = Array.isArray(value) ? value : [];
      return tags.length === 0 ? null : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={String(tag)} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {String(tag)}
            </span>
          ))}
        </div>
      );
    }
    case "list":
    case "radio":
    case "multiChoice": {
      const values = field.type === "multiChoice"
        ? (Array.isArray(value) ? value.map(String) : [])
        : isEmpty(value)
          ? []
          : [String(value)];
      if (values.length === 0) return null;
      return (
        <span>
          {values.map((item, index) => (
            <span key={item}>
              {index > 0 && ", "}
              {renderOption(field, item, linkTitles)}
            </span>
          ))}
        </span>
      );
    }
    default:
      return isEmpty(value) ? null : <p>{String(value)}</p>;
  }
}

// An option value: a form-sourced value is an entry slug → wiki link to it
// (raw slug if the target was deleted); an inline value shows its label.
function renderOption(
  field: FormField,
  value: string,
  linkTitles: Record<string, string>
): React.ReactNode {
  if (isOptionsField(field) && field.sourceFormId) {
    const title = linkTitles[value];
    return (
      <Link href={`/${value}`} className="text-primary underline">
        {title ?? value}
      </Link>
    );
  }
  if (isOptionsField(field) && field.options) {
    return field.options[value] ?? value;
  }
  return value;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function readPoint(value: unknown): { lat: number; lng: number } | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const point = value as { lat?: unknown; lng?: unknown };
    if (typeof point.lat === "number" && typeof point.lng === "number") {
      return { lat: point.lat, lng: point.lng };
    }
  }
  return null;
}

function localizedDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}
