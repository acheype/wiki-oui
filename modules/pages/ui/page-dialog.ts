/**
 * The contract of a page dialog the overflow menu opens (page-actions-menu.tsx):
 * which page it acts on, and how it tells the menu it has closed. Shared so the
 * three dialogs — accès, adresse, suppression — declare one shape, not three.
 */
export type PageDialogProps = { slug: string; onClose: () => void };
