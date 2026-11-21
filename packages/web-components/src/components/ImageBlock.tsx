
import type { CSSProperties } from "react";
import { safeUrl } from "./urls.js";

// =====================================================
// TIPOS
// =====================================================

export type ImageFit =
  | "cover"
  | "contain"
  | "fill"
  | "none"
  | "scale-down";

export type ImagePosition =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type ImageAspectRatio =
  | "auto"
  | "square"
  | "landscape"
  | "portrait"
  | "wide";

export type ImageShadow =
  | "none"
  | "small"
  | "medium"
  | "large";

export interface ImageBlockProps {
  // CONTENIDO
  src: string;
  alt: string;

  // DIMENSIONES
  width?: number;
  height?: number;
  aspectRatio?: ImageAspectRatio;

  // AJUSTE
  fit?: ImageFit;
  objectPosition?: ImagePosition;

  // APARIENCIA
  borderRadius?: number;
  shadow?: ImageShadow;
  opacity?: number;

  // COMPORTAMIENTO
  href?: string;
  newTab?: boolean;
  loading?: "lazy" | "eager";
}

// =====================================================
// MAPAS VISUALES
// =====================================================

const aspectRatios: Record<
  ImageAspectRatio,
  string | undefined
> = {
  auto: undefined,
  square: "1 / 1",
  landscape: "4 / 3",
  portrait: "3 / 4",
  wide: "16 / 9",
};

const objectPositions: Record<
  ImagePosition,
  string
> = {
  center: "center",
  top: "center top",
  bottom: "center bottom",
  left: "left center",
  right: "right center",
  "top-left": "left top",
  "top-right": "right top",
  "bottom-left": "left bottom",
  "bottom-right": "right bottom",
};

const shadows: Record<ImageShadow, string> = {
  none: "none",
  small: "0 2px 6px rgb(0 0 0 / 0.12)",
  medium: "0 8px 24px rgb(0 0 0 / 0.16)",
  large: "0 20px 48px rgb(0 0 0 / 0.20)",
};

// =====================================================
// COMPONENTE IMAGE BLOCK
// =====================================================

export function ImageBlock({
  src,
  alt,

  width,
  height,
  aspectRatio = "auto",

  fit = "cover",
  objectPosition = "center",

  borderRadius,
  shadow,
  opacity = 1,

  href,
  newTab = false,
  loading = "lazy",
}: ImageBlockProps) {
  const safeSrc = safeUrl(src, true);

  const selectedRatio =
    aspectRatios[aspectRatio];

  const ratio =
    selectedRatio ??
    (
      width && height
        ? `${width} / ${height}`
        : undefined
    );

  const style: CSSProperties = {
    objectFit: fit,
    objectPosition:
      objectPositions[objectPosition],

    aspectRatio: ratio,

    ...(selectedRatio
      ? {
          width: "100%",
          height: "auto",
        }
      : {}),

    borderRadius,
    boxShadow: shadow
      ? shadows[shadow]
      : undefined,
    opacity,
  };

  const image = (
    <img
      className="jws-image"
      src={safeSrc}
      alt={alt}
      width={width}
      height={height}
      style={style}
      loading={loading}
      decoding="async"
    />
  );

  // Sin enlace: devolver únicamente la imagen.
  if (!href?.trim()) {
    return image;
  }

  // Con enlace: la imagen se vuelve interactiva.
  return (
    <a
      href={safeUrl(href)}
      target={newTab ? "_blank" : undefined}
      rel={
        newTab
          ? "noopener noreferrer"
          : undefined
      }
      aria-label={
        alt.trim() || "Abrir enlace de imagen"
      }
      style={{
        display: "inline-block",
        maxWidth: "100%",
      }}
    >
      {image}
    </a>
  );
}
