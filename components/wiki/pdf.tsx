import { fileUrl } from "@/lib/files";

export type PdfProps = {
  /** Uploaded file name (files/ directory, ADR 0012). */
  file?: string;
  ratio?: "portrait" | "landscape" | "square";
};

export const pdfDefaults = {
  file: undefined,
  ratio: "portrait",
} satisfies { [K in keyof Required<PdfProps>]: PdfProps[K] };

const ratioClasses: Record<NonNullable<PdfProps["ratio"]>, string> = {
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
  square: "aspect-square",
};

// Shows a PDF inside the page through the browser's built-in reader.
export function Pdf({ file, ratio = pdfDefaults.ratio }: PdfProps) {
  if (!file) return null;
  return (
    <iframe
      src={fileUrl(file)}
      title={file}
      className={`w-full rounded-md border ${ratioClasses[ratio]}`}
    />
  );
}
