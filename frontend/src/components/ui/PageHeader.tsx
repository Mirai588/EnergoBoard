import { ReactNode } from "react";

type HeaderVariant = "page" | "section";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  align?: "start" | "center";
  variant?: HeaderVariant;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  align = "start",
  variant = "page",
}: PageHeaderProps) {
  const heading = variant === "page" ? <h1>{title}</h1> : <h3>{title}</h3>;
  return (
    <div className={`page-header ${variant === "section" ? "page-header--section" : ""}`} data-align={align}>
      <div>
        {eyebrow && <p className="subtitle">{eyebrow}</p>}
        {heading}
        {description && <p className="subtitle">{description}</p>}
        {children}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
