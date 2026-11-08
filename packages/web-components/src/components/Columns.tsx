import type { ReactNode } from "react";

export interface ColumnsProps {
  children: ReactNode;
  columns?: 2 | 3;
}
export function Columns({ children, columns = 2 }: ColumnsProps) {
  return <div className={`jws-columns jws-columns--${columns}`}>{children}</div>;
}
