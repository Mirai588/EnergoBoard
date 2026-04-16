import { ComponentPropsWithoutRef, ElementType } from "react";

type SurfaceTone = "default" | "soft" | "contrast";
type SurfacePadding = "default" | "compact" | "flush";

type BaseProps = {
  tone?: SurfaceTone;
  padding?: SurfacePadding;
  interactive?: boolean;
};

type PolymorphicProps<T extends ElementType> = BaseProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof BaseProps | "as">;

export function Surface<T extends ElementType = "div">({
  as,
  tone = "default",
  padding = "default",
  interactive = true,
  className,
  ...rest
}: PolymorphicProps<T>) {
  const Component = as || "div";
  const classes = [
    "surface",
    tone !== "default" ? `surface-${tone}` : "",
    padding !== "default" ? `surface-${padding}` : "",
    !interactive ? "surface-static" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  return <Component className={classes} {...(rest as ComponentPropsWithoutRef<T>)} />;
}
