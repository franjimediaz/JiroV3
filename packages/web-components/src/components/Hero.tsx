
import type { CSSProperties } from "react";

import { Heading } from "./Heading.js";
import { TextBlock } from "./TextBlock.js";

import {
  ImageBlock,
  type ImageBlockProps,
} from "./ImageBlock.js";

import {
  ButtonLink,
  type ButtonLinkProps,
} from "./ButtonLink.js";

import { safeUrl } from "./urls.js";

// =====================================================
// TIPOS
// =====================================================

export type HeroAlignment =
  | "left"
  | "center"
  | "right";

export type HeroLayout =
  | "split"
  | "stacked";

export type HeroVerticalAlignment =
  | "start"
  | "center"
  | "end";

export interface HeroProps {
  // CONTENIDO ORIGINAL
  title: string;
  subtitle: string;
  image?: ImageBlockProps;
  button?: ButtonLinkProps;
  align?: HeroAlignment;

  // DISTRIBUCIÓN
  layout?: HeroLayout;
  verticalAlign?: HeroVerticalAlignment;

  // DIMENSIONES
  minHeight?: number;
  contentMaxWidth?: number;
  padding?: number;

  // FONDO
  backgroundColor?: string;
  backgroundImage?: string;

  // OVERLAY
  overlayColor?: string;
  overlayOpacity?: number;

  // TIPOGRAFÍA
  titleColor?: string;
  subtitleColor?: string;

  // SEGUNDO BOTÓN
  secondButton?: ButtonLinkProps;

  // APARIENCIA
  borderRadius?: number;
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

function hasValidImage(
  image?: ImageBlockProps
): image is ImageBlockProps {
  return (
    typeof image?.src === "string" &&
    image.src.trim().length > 0
  );
}

function hasValidButton(
  button?: ButtonLinkProps
): button is ButtonLinkProps {
  return (
    typeof button?.href === "string" &&
    button.href.trim().length > 0 &&
    typeof button.text === "string" &&
    button.text.trim().length > 0
  );
}

const verticalAlignment: Record<
  HeroVerticalAlignment,
  CSSProperties["alignItems"]
> = {
  start: "start",
  center: "center",
  end: "end",
};

const horizontalAlignment: Record<
  HeroAlignment,
  CSSProperties["justifyContent"]
> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

// =====================================================
// COMPONENTE HERO
// =====================================================

export function Hero({
  title,
  subtitle,

  image,
  button,
  align = "left",

  layout = "split",
  verticalAlign = "center",

  minHeight,
  contentMaxWidth,
  padding,

  backgroundColor,
  backgroundImage,

  overlayColor = "#000000",
  overlayOpacity = 0,

  titleColor,
  subtitleColor,

  secondButton,

  borderRadius,
}: HeroProps) {
  const hasImage = hasValidImage(image);
  const hasBackgroundImage =
    typeof backgroundImage === "string" &&
    backgroundImage.trim().length > 0;

  const showPrimaryButton = hasValidButton(button);
  const showSecondaryButton =
    hasValidButton(secondButton);

  // ===================================================
  // ESTILOS DEL CONTENEDOR
  // ===================================================

  const sectionStyle: CSSProperties = {
    position: "relative",
    isolation: "isolate",
    overflow: "hidden",

    minHeight,
    padding,
    borderRadius,

    backgroundColor,

    backgroundImage: hasBackgroundImage
      ? `url("${safeUrl(backgroundImage, true)}")`
      : undefined,

    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",

    alignItems: verticalAlignment[verticalAlign],

    // En modo apilado anulamos la cuadrícula
    // de dos columnas del CSS original.
    gridTemplateColumns:
      layout === "stacked"
        ? "minmax(0, 1fr)"
        : undefined,
  };

  // ===================================================
  // ESTILOS DEL CONTENIDO
  // ===================================================

  const contentStyle: CSSProperties = {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: contentMaxWidth,
    minWidth: 0,

    marginLeft:
      align === "center" ? "auto" : undefined,

    marginRight:
      align === "center" || align === "right"
        ? "auto"
        : undefined,

    textAlign: align,
  };

  const actionsStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: horizontalAlignment[align],
    gap: 12,
  };

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <section
      className={[
        "jws-hero",
        `jws-hero--${align}`,
        `jws-hero--${layout}`,
        hasImage ? "jws-hero--with-image" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={sectionStyle}
    >
      {/* OVERLAY */}

      {overlayOpacity > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            backgroundColor: overlayColor,
            opacity: overlayOpacity,
          }}
        />
      )}

      {/* CONTENIDO */}

      <div
        className="jws-hero__content"
        style={contentStyle}
      >
        <Heading
          level={1}
          text={title}
          align={align}
          style={
            titleColor
              ? { color: titleColor }
              : undefined
          }
        />

        <TextBlock
          text={subtitle}
          align={align}
          style={
            subtitleColor
              ? { color: subtitleColor }
              : undefined
          }
        />

        {/* BOTONES */}

        {(showPrimaryButton || showSecondaryButton) && (
          <div
            className="jws-hero__action"
            style={actionsStyle}
          >
            {showPrimaryButton && (
              <ButtonLink {...button} />
            )}

            {showSecondaryButton && (
              <ButtonLink {...secondButton} />
            )}
          </div>
        )}
      </div>

      {/* IMAGEN LATERAL O INFERIOR */}

      {hasImage && (
        <div
          className="jws-hero__image"
          style={{
            position: "relative",
            zIndex: 1,
            minWidth: 0,
          }}
        >
          <ImageBlock {...image} />
        </div>
      )}
    </section>
  );
}
