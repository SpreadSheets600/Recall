import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentType,
  ReactNode,
  Ref,
} from "react";
import { cx, sortCx } from "@/utils/cx";
import { directionalIconClass } from "@/utils/directional-icon";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "destructive"
  | "outline";
type ButtonSize = "medium" | "small" | "xs" | "md" | "sm" | "lg";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  children?: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
}

const SIZE_STYLES: Record<string, string> = {
  medium: "h-9 rounded-xl px-3 py-2 text-body-medium",
  md:     "h-9 rounded-xl px-3 py-2 text-body-medium",
  small:  "h-8 rounded-lg px-2.5 py-1.5 text-body-medium",
  sm:     "h-8 rounded-lg px-2.5 py-1.5 text-body-medium",
  xs:     "h-6.5 rounded-lg px-2 text-caption-1-semibold",
  lg:     "h-10 rounded-xl px-4 py-2.5 text-body-large",
};

const ICON_ONLY_STYLES: Record<string, string> = {
  medium: "size-9 p-0 rounded-xl",
  md:     "size-9 p-0 rounded-xl",
  small:  "size-8 p-0 rounded-lg",
  sm:     "size-8 p-0 rounded-lg",
  xs:     "size-6.5 p-0 rounded-lg",
  lg:     "size-10 p-0 rounded-xl",
};

const ICON_STYLES: Record<string, string> = {
  medium: "size-5 shrink-0",
  md:     "size-5 shrink-0",
  small:  "size-[18px] shrink-0",
  sm:     "size-[18px] shrink-0",
  xs:     "size-3.5 shrink-0",
  lg:     "size-5 shrink-0",
};

const LABEL_STYLES: Record<string, string> = {
  medium: "inline-flex items-center justify-center px-1 shrink-0",
  md:     "inline-flex items-center justify-center px-1 shrink-0",
  small:  "inline-flex items-center justify-center px-0.5 shrink-0",
  sm:     "inline-flex items-center justify-center px-0.5 shrink-0",
  xs:     "inline-flex items-center justify-center px-0.5 shrink-0",
  lg:     "inline-flex items-center justify-center px-1.5 shrink-0",
};

const VARIANT_STYLES: Record<string, string> = {
  primary: [
    "bg-accent-500 hover:bg-accent-600 active:bg-accent-700 text-text-white shadow-xs",
    "disabled:opacity-50 disabled:shadow-none",
    "aria-disabled:opacity-50 aria-disabled:shadow-none",
  ].join(" "),
  danger: [
    "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-xs border border-red-600/30",
    "disabled:opacity-50 disabled:shadow-none",
    "aria-disabled:opacity-50 aria-disabled:shadow-none",
  ].join(" "),
  destructive: [
    "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-xs border border-red-600/30",
    "disabled:opacity-50 disabled:shadow-none",
    "aria-disabled:opacity-50 aria-disabled:shadow-none",
  ].join(" "),
  secondary: [
    "bg-background-primary-default text-text-primary",
    "border border-border-button-default shadow-xs",
    "hover:bg-background-primary-hover hover:border-border-button-hover",
    "active:bg-background-primary-active active:border-border-button-active",
    "disabled:bg-background-primary-disabled disabled:border-border-button-default disabled:text-text-tertiary disabled:shadow-none",
    "aria-disabled:bg-background-primary-disabled aria-disabled:border-border-button-default aria-disabled:text-text-tertiary aria-disabled:shadow-none",
  ].join(" "),
  outline: [
    "bg-transparent text-text-primary",
    "border border-border-button-default shadow-xs",
    "hover:bg-background-secondary-default hover:border-border-button-hover",
    "active:bg-background-secondary-active active:border-border-button-active",
    "disabled:opacity-50 disabled:border-border-button-default disabled:text-text-tertiary disabled:shadow-none",
    "aria-disabled:opacity-50 aria-disabled:border-border-button-default aria-disabled:text-text-tertiary aria-disabled:shadow-none",
  ].join(" "),
  ghost: [
    "bg-transparent text-text-secondary",
    "hover:bg-background-secondary-default hover:text-text-primary active:bg-background-secondary-active",
    "disabled:opacity-50 disabled:shadow-none",
    "aria-disabled:opacity-50 aria-disabled:shadow-none",
  ].join(" "),
};

const BASE_BUTTON = [
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden",
  "font-sans select-none cursor-pointer rounded-xl font-medium",
  "button-press-motion transition-all duration-150 ease-in-out",
  "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring",
  "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
].join(" ");

export function Button({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  children,
  className,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  const normSize = SIZE_STYLES[size] ? size : "medium";
  return (
    <button
      ref={ref}
      type={type}
      className={sortCx(
        cx(
          BASE_BUTTON,
          VARIANT_STYLES[variant] || VARIANT_STYLES.primary,
          iconOnly ? ICON_ONLY_STYLES[normSize] : SIZE_STYLES[normSize],
          className
        )
      )}
      {...props}
    >
      {Leading && (
        <Leading className={directionalIconClass(ICON_STYLES[normSize])} />
      )}
      {!iconOnly && children != null && (
        <span className={LABEL_STYLES[normSize]}>{children}</span>
      )}
      {Trailing && (
        <Trailing className={directionalIconClass(ICON_STYLES[normSize])} />
      )}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  children,
  className,
  ref,
  ...props
}: ButtonLinkProps) {
  const normSize = SIZE_STYLES[size] ? size : "medium";
  return (
    <a
      ref={ref}
      className={sortCx(
        cx(
          BASE_BUTTON,
          VARIANT_STYLES[variant] || VARIANT_STYLES.primary,
          iconOnly ? ICON_ONLY_STYLES[normSize] : SIZE_STYLES[normSize],
          className
        )
      )}
      {...props}
    >
      {Leading && (
        <Leading className={directionalIconClass(ICON_STYLES[normSize])} />
      )}
      {!iconOnly && children != null && (
        <span className={LABEL_STYLES[normSize]}>{children}</span>
      )}
      {Trailing && (
        <Trailing className={directionalIconClass(ICON_STYLES[normSize])} />
      )}
    </a>
  );
}
