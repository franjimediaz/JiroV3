import { safeUrl } from "./urls.js";

export interface ImageBlockProps {
  src: string;
  alt: string;
  fit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  width?: number;
  height?: number;
}
export function ImageBlock({ src, alt, fit = "cover", width, height }: ImageBlockProps) {
  return <img className="jws-image" src={safeUrl(src, true)} alt={alt} width={width} height={height} style={{ objectFit: fit, aspectRatio: width && height ? `${width} / ${height}` : undefined }} loading="lazy" decoding="async" />;
}
