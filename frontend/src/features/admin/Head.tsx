import type { ReactNode } from "react";

export const Head = ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
  <div className="line">
    <h1>{title}</h1>
    <div className="flex gap-2 flex-wrap justify-end">{children}</div>
  </div>
);
