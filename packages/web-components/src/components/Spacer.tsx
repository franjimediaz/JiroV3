export interface SpacerProps {
  size?: "none" | "small" | "medium" | "large" | "xlarge";
}
export function Spacer({ size = "medium" }: SpacerProps) {
  return <div className={`jws-spacer jws-spacer--${size}`} aria-hidden="true" />;
}
