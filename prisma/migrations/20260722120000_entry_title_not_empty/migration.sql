-- Every entry revision carries a non-empty title (ADR 0020). The title is
-- computed at write and stored in `data` like any other field value, so a
-- future import or bulk write that forgot it fails here rather than
-- surfacing weeks later as an untitled entry in a view.
-- coalesce() covers all three ways to miss: absent key, JSON null, empty
-- string — a bare length() > 0 evaluates to NULL for the first two, and a
-- NULL CHECK expression passes.
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_entry_has_title"
    CHECK ("data" IS NULL OR coalesce(length("data"->>'title'), 0) > 0);
