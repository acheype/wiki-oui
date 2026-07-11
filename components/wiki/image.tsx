import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./internal/image-lightbox";
import { WikiLink } from "./wiki-link";

export type ImageProps = {
  /** Uploaded file name (files/ directory, ADR 0012). */
  file?: string;
  /** Alternative text for visually impaired readers. */
  alt?: string;
  align?: "none" | "left" | "center" | "right";
  /** Pixels; empty means the original size. */
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

export const imageDefaults = {
  file: undefined,
  alt: undefined,
  align: "none",
  width: undefined,
  height: undefined,
  link: undefined,
  lightbox: false,
  caption: undefined,
  whiteBorder: false,
  shadow: false,
  hoverZoom: false,
} satisfies { [K in keyof Required<ImageProps>]: ImageProps[K] };

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
  align = imageDefaults.align,
  width,
  height,
  link,
  lightbox = imageDefaults.lightbox,
  caption,
  whiteBorder = imageDefaults.whiteBorder,
  shadow = imageDefaults.shadow,
  hoverZoom = imageDefaults.hoverZoom,
}: ImageProps) {
  if (!file) return null;

  const src = fileUrl(file);
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
    <img
      src={src}
      alt={alt ?? ""}
      title={caption}
      width={width}
      height={height}
      className={imgClassName}
    />
  );

  if (link) {
    return (
      <WikiLink href={link} className={alignClasses[align]}>
        {img}
      </WikiLink>
    );
  }
  if (lightbox) {
    return (
      <ImageLightbox src={src} alt={alt} className={alignClasses[align]}>
        {img}
      </ImageLightbox>
    );
  }
  return img;
}
