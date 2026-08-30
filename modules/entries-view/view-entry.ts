/** One entry as the view consumes it: referenced field values only. */
export interface ViewEntry {
  slug: string;
  title: string;
  // Field values under their names; pseudo-fields under their $ names
  // ($createdAt/$editedAt as ISO datetimes, $form as the form slug).
  values: Record<string, unknown>;
}
