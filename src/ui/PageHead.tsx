import type { ReactNode } from "react";

export function PageHead({ title, intro, actions }: { title: string; intro?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="display display-lg">{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <div className="display display-md">{title}</div>
      {children && <p>{children}</p>}
    </div>
  );
}
