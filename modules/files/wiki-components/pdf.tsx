import { fileUrl } from "@/modules/files/storage";

export type PdfProps = {
  /** Uploaded file name (files/ directory, ADR 0012). */
  file?: string;
  ratio?: "portrait" | "landscape" | "square";
};

const ratioClasses: Record<NonNullable<PdfProps["ratio"]>, string> = {
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
  square: "aspect-square",
};

// Shows a PDF inside the page through the browser's built-in reader.
export function Pdf({ file, ratio = "portrait" }: PdfProps) {
  if (!file) return null;
  return (
    <iframe
      src={fileUrl(file)}
      title={file}
      className={`w-full rounded-md border ${ratioClasses[ratio]}`}
    />
  );
}
