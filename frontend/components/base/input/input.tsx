"use client";

import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import {
  Group as AriaGroup,
  Input as AriaInput,
  TextField as AriaTextField,
  useLocale,
} from "react-aria-components";
import type {
  InputProps as AriaInputProps,
  TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { Label } from "./label";
import { HintText } from "./hint-text";
import { cx, sortCx } from "@/utils/cx";

export type InputSize = "medium" | "small";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/* -------------------------------------------------------------------------- */
/*  TextFieldContext                                                           */
/* -------------------------------------------------------------------------- */

export interface TextFieldContextValue {
  size?: InputSize;
  fieldClassName?: string;
  inputClassName?: string;
}

export const TextFieldContext = createContext<TextFieldContextValue>({});

/* -------------------------------------------------------------------------- */
/*  TextField                                                                  */
/* -------------------------------------------------------------------------- */

export interface TextFieldProps
  extends Omit<AriaTextFieldProps, "className">,
    TextFieldContextValue {
  className?: string;
  children?: ReactNode | ((state: { isRequired: boolean; isInvalid: boolean; isDisabled: boolean; isReadOnly: boolean }) => ReactNode);
}

export function TextField({
  size = "medium",
  fieldClassName,
  inputClassName,
  className,
  children,
  ...props
}: TextFieldProps) {
  return (
    <TextFieldContext.Provider value={{ size, fieldClassName, inputClassName }}>
      <AriaTextField
        {...props}
        data-input-size={size}
        className={cx(
          "group flex h-max w-full flex-col items-start gap-1",
          className,
        )}
      >
        {children as never}
      </AriaTextField>
    </TextFieldContext.Provider>
  );
}

TextField.displayName = "TextField";

/* -------------------------------------------------------------------------- */
/*  InputBase                                                                  */
/* -------------------------------------------------------------------------- */

export interface InputBaseProps extends Omit<AriaInputProps, "size" | "className"> {
  size?: InputSize;
  className?: string;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  leadingAddon?: ReactNode;
  fieldClassName?: string;
  ref?: Ref<HTMLInputElement>;
  groupRef?: Ref<HTMLDivElement>;
}

const inputStyles = sortCx({
  field: [
    "relative flex w-full items-center",
    "rounded-xl border border-border-button-default bg-background-secondary-default/50 text-foreground-icon-tertiary shadow-2xs",
    "hover:border-border-button-hover",
    "focus-within:border-border-focus-ring focus-within:ring-2 focus-within:ring-border-focus-ring/20 focus-within:bg-background-primary-default",
    "transition-all duration-150 ease-in-out",
  ].join(" "),

  fieldSize: {
    medium: "h-10 px-3 py-1.5",
    small:  "h-8 px-2.5 py-1",
  },

  fieldWithAddonSize: {
    medium: "h-10 ps-1.5 pe-3 py-1.5",
    small:  "h-8 ps-1 pe-2 py-1",
  },

  content: "flex w-full items-center gap-2 min-w-0",
  leftSection: "flex flex-1 items-center gap-2 min-w-0",

  input: [
    "min-w-0 flex-1 bg-transparent border-0 outline-none p-0 m-0",
    "font-sans text-body-small text-text-primary",
    "placeholder:text-text-tertiary",
    "focus:placeholder:text-text-tertiary/70",
    "disabled:text-input-disabled-text disabled:placeholder:text-input-disabled-text",
    "disabled:cursor-not-allowed",
    "aria-invalid:placeholder:text-text-error-placeholder",
  ].join(" "),

  icon: "size-4 text-text-tertiary shrink-0",
});

export function InputBase({
  size: sizeProp,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  leadingAddon,
  fieldClassName,
  className,
  ref,
  groupRef,
  ...inputProps
}: InputBaseProps) {
  const { direction } = useLocale();
  const ctx = useContext(TextFieldContext);
  const size: InputSize = sizeProp ?? ctx.size ?? "medium";
  const hasAddon = leadingAddon !== undefined && leadingAddon !== null;

  return (
    <AriaGroup
      ref={groupRef}
      className={({ isDisabled, isInvalid }) =>
        cx(
          inputStyles.field,
          hasAddon
            ? inputStyles.fieldWithAddonSize[size]
            : inputStyles.fieldSize[size],
          isDisabled &&
            "bg-input-disabled-background text-input-disabled-foreground cursor-not-allowed opacity-60",
          isInvalid && "border-red-500 ring-2 ring-red-500/20",
          ctx.fieldClassName,
          fieldClassName,
        )
      }
    >
      <div className={inputStyles.content}>
        <div className={inputStyles.leftSection}>
          {hasAddon ? (
            leadingAddon
          ) : Leading ? (
            <Leading className={inputStyles.icon} aria-hidden />
          ) : null}
          <AriaInput
            ref={ref}
            {...inputProps}
            className={cx(inputStyles.input, direction === "rtl" ? "text-right" : "text-left", ctx.inputClassName, className)}
          />
        </div>
        {Trailing ? (
          <Trailing className={inputStyles.icon} aria-hidden />
        ) : null}
      </div>
    </AriaGroup>
  );
}

InputBase.displayName = "InputBase";

/* -------------------------------------------------------------------------- */
/*  Input (composed)                                                           */
/* -------------------------------------------------------------------------- */

export interface InputProps
  extends Omit<TextFieldProps, "children">,
    Pick<
      InputBaseProps,
      | "leadingIcon"
      | "trailingIcon"
      | "leadingAddon"
      | "fieldClassName"
      | "groupRef"
      | "ref"
    > {
  label?: ReactNode;
  hint?: ReactNode;
  tooltip?: boolean | string;
  placeholder?: string;
  inputDir?: "ltr" | "rtl" | "auto";
}

export function Input({
  label,
  hint,
  tooltip,
  placeholder,
  inputDir,
  leadingIcon,
  trailingIcon,
  leadingAddon,
  fieldClassName,
  ref,
  groupRef,
  className,
  ...textFieldProps
}: InputProps) {
  return (
    <TextField
      {...textFieldProps}
      className={className}
      aria-label={
        textFieldProps["aria-label"] ??
        (label ? undefined : (placeholder || "Input"))
      }
    >
      {({ isRequired }) => (
        <>
          {label && (
            <Label isRequired={isRequired} tooltip={tooltip}>
              {label}
            </Label>
          )}
          <InputBase
            ref={ref}
            groupRef={groupRef}
            placeholder={placeholder}
            dir={inputDir}
            leadingIcon={leadingIcon}
            trailingIcon={trailingIcon}
            leadingAddon={leadingAddon}
            fieldClassName={fieldClassName}
          />
          {hint && <HintText>{hint}</HintText>}
        </>
      )}
    </TextField>
  );
}

Input.displayName = "Input";
