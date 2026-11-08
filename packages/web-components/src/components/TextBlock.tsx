export interface TextBlockProps {
  text: string;
  align?: "left" | "center" | "right";
}
export function TextBlock({ text, align = "left" }: TextBlockProps) {
  return <p className="jws-text" style={{ textAlign: align }}>{text}</p>;
}
