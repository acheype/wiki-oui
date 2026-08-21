import { fileUrl } from "@/lib/files";
import { imageUrl } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./internal/image-lightbox";
import { WikiLinkView } from "./internal/wiki-link-view";

export type ImageProps = {
  /** Uploaded file name (files/ directory, ADR 0012). */
  file?: string;
  /** Alternative text for visually impaired readers. */
  alt?: string;
  align?: "none" | "left" | "center" | "right";
  /** Pixels; a bounding box keeping the ratio, empty means the original size. */
  width?: number;
  height?: number;
  /** Web link or wiki page opened when clicking the image. */
  link?: string;
  /** Click opens the image full size in a modal (ignored with `link`). */
  lightbox?: boolean;
  /** Hover text (HTML title). */
  caption?: string;
  whiteBorder?: boolean;
  shadow?: boolean;
  hoverZoom?: boolean;
};

// Layout goes on the outermost element (the image itself, or its link /
// lightbox wrapper); the graphic effects stay on the <img>.
const alignClasses: Record<NonNullable<ImageProps["align"]>, string> = {
  none: "block",
  left: "float-left mr-4 mb-2",
  right: "float-right ml-4 mb-2",
  center: "mx-auto block w-fit",
};

export function Image({
  file,
  alt,
  align = "none",
  width,
  height,
  link,
  lightbox = false,
  caption,
  whiteBorder = false,
  shadow = false,
  hoverZoom = false,
}: ImageProps) {
  if (!file) return null;

  // width/height are a bounding box served by the resize API, not a stretch:
  // asking for a size downloads that size, and the ratio is always kept. The
  // lightbox keeps the untouched original — its whole point is full size.
  const src = imageUrl(file, { width, height });
  const fullSize = fileUrl(file);
  const wrapped = Boolean(link) || lightbox;
  const imgClassName = cn(
    "h-auto max-w-full",
    whiteBorder && "border-8 border-white shadow-sm",
    shadow && "shadow-lg",
    hoverZoom && "transition-transform duration-300 hover:scale-105",
    !wrapped && alignClasses[align]
  );

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- served by our files API, dimensions unknown
    <img src={src} alt={alt ?? ""} title={caption} className={imgClassName} />
  );

  if (link) {
    return (
      <WikiLinkView href={link} className={alignClasses[align]}>
        {img}
      </WikiLinkView>
    );
  }
  if (lightbox) {
    return (
      <ImageLightbox src={fullSize} alt={alt} className={alignClasses[align]}>
        {img}
      </ImageLightbox>
    );
  }
  return img;
}
