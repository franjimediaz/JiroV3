import { Heading } from "./Heading.js";
import { TextBlock } from "./TextBlock.js";
import { ImageBlock, type ImageBlockProps } from "./ImageBlock.js";
import { ButtonLink, type ButtonLinkProps } from "./ButtonLink.js";

export interface HeroProps {
  title: string;
  subtitle: string;
  image?: ImageBlockProps;
  button?: ButtonLinkProps;
  align?: "left" | "center" | "right";
}
export function Hero({ title, subtitle, image, button, align = "left" }: HeroProps) {
  return (
  <section className={`jws-hero jws-hero--${align}${typeof image?.src === "string" && image.src.trim() !== "" ? " jws-hero--with-image" : ""}`}>
      <div className="jws-hero__content">
        <Heading level={1} text={title} align={align} />
        <TextBlock text={subtitle} align={align} />
        {typeof button?.href === "string" && button.href.trim() !== "" &&
          typeof button.text === "string" && button.text.trim() !== "" && (
            <div className="jws-hero__action">
              <ButtonLink {...button} />
            </div>
          )}
      </div>
      {typeof image?.src === "string" && image.src.trim() !== "" && (
        <div className="jws-hero__image">
          <ImageBlock {...image} />
        </div>
      )}
    </section>
  );
}
