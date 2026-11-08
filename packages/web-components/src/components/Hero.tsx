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
    <section className={`jws-hero jws-hero--${align}${image ? " jws-hero--with-image" : ""}`}>
      <div className="jws-hero__content">
        <Heading level={1} text={title} align={align} />
        <TextBlock text={subtitle} align={align} />
        {button && <div className="jws-hero__action"><ButtonLink {...button} /></div>}
      </div>
      {image && <div className="jws-hero__image"><ImageBlock {...image} /></div>}
    </section>
  );
}
