"use client";

import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  Group as AriaGroup,
  TextArea as AriaTextArea,
} from "react-aria-components";
import type { TextAreaProps as AriaTextAreaProps } from "react-aria-components";
import {
  TextField,
  TextFieldContext,
  type TextFieldProps,
} from "../input/input";
import { Label } from "../input/label";
import { HintText } from "../input/hint-text";
import { cx, sortCx } from "@/utils/cx";

export type TextareaSize = "medium" | "small";
export type TextareaResize = "none" | "vertical";

/* -------------------------------------------------------------------------- */
/*  TextareaBase                                                               */
/* -------------------------------------------------------------------------- */

export interface TextareaBaseProps
  extends Omit<AriaTextAreaProps, "size" | "className" | "rows"> {
  size?: TextareaSize;
  className?: string;
  rows?: number;
  autoResize?: boolean;
  maxRows?: number;
  resize?: TextareaResize;
  fieldClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
  groupRef?: Ref<HTMLDivElement>;
}

const textareaStyles = sortCx({
  field: [
    "relative flex w-full flex-col",
    "rounded-xl border border-border-button-default bg-background-secondary-default/50 text-foreground-icon-tertiary shadow-2xs",
    "hover:border-border-button-hover",
    "focus-within:border-border-focus-ring focus-within:ring-2 focus-within:ring-border-focus-ring/20 focus-within:bg-background-primary-default",
    "transition-all duration-150 ease-in-out",
  ].join(" "),

  fieldSize: {
    medium: "p-3",
    small: "px-2.5 py-2",
  },

  textarea: [
    "block w-full min-w-0 bg-transparent border-0 outline-none m-0 p-0",
    "font-sans text-body-small text-text-primary",
    "placeholder:text-text-tertiary",
    "focus:placeholder:text-text-tertiary/70",
    "disabled:text-input-disabled-text disabled:placeholder:text-input-disabled-text",
    "disabled:cursor-not-allowed",
    "aria-invalid:placeholder:text-text-error-placeholder",
  ].join(" "),

  resize: {
    none: "resize-none",
    vertical: "resize-y",
  },

  footer: "flex w-full items-start justify-between gap-3 mt-1.5",
  count: "ms-auto shrink-0 pt-px text-caption-1-medium text-text-tertiary tabular-nums",
});

const FALLBACK_LINE_HEIGHT = 20;

export function TextareaBase({
  size: sizeProp,
  rows = 3,
  autoResize = false,
  maxRows,
  resize = "vertical",
  fieldClassName,
  className,
  ref,
  groupRef,
  onInput,
  ...textareaProps
}: TextareaBaseProps) {
  const ctx = useContext(TextFieldContext);
  const size: TextareaSize = sizeProp ?? ctx.size ?? "medium";
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const attachRef = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = node;
  };

  const fit = () => {
    const field = innerRef.current;
    if (!field) return;
    if (!autoResize) {
      field.style.height = "";
      field.style.maxHeight = "";
      field.style.overflowY = "";
      return;
    }
    const line =
      parseFloat(window.getComputedStyle(field).lineHeight) || FALLBACK_LINE_HEIGHT;
    const ceiling = maxRows ? maxRows * line : Infinity;
    field.style.height = "0px";
    const next = Math.max(field.scrollHeight, rows * line);
    field.style.height = `${Math.min(next, ceiling)}px`;
    field.style.maxHeight = maxRows ? `${ceiling}px` : "";
    field.style.overflowY = next > ceiling ? "auto" : "hidden";
  };

  useLayoutEffect(fit);

  return (
    <AriaGroup
      ref={groupRef}
      className={({ isDisabled, isInvalid }) =>
        cx(
          textareaStyles.field,
          textareaStyles.fieldSize[size],
          isDisabled &&
            "bg-input-disabled-background text-input-disabled-foreground cursor-not-allowed opacity-60",
          isInvalid && "border-red-500 ring-2 ring-red-500/20",
          ctx.fieldClassName,
          fieldClassName,
        )
      }
    >
      <AriaTextArea
        ref={attachRef}
        rows={rows}
        {...textareaProps}
        onInput={(event) => {
          fit();
          onInput?.(event);
        }}
        className={cx(
          textareaStyles.textarea,
          textareaStyles.resize[autoResize ? "none" : resize],
          ctx.inputClassName,
          className,
        )}
      />
    </AriaGroup>
  );
}

TextareaBase.displayName = "TextareaBase";

/* -------------------------------------------------------------------------- */
/*  Textarea (composed)                                                        */
/* -------------------------------------------------------------------------- */

export interface TextareaProps
  extends Omit<TextFieldProps, "children">,
    Pick<
      TextareaBaseProps,
      | "rows"
      | "autoResize"
      | "maxRows"
      | "resize"
      | "fieldClassName"
      | "groupRef"
      | "ref"
    > {
  label?: ReactNode;
  hint?: ReactNode;
  tooltip?: boolean | string;
  placeholder?: string;
  maxLength?: number;
  showCount?: boolean;
}

export function Textarea({
  label,
  hint,
  tooltip,
  placeholder,
  rows,
  autoResize,
  maxRows,
  resize,
  maxLength,
  showCount = false,
  fieldClassName,
  ref,
  groupRef,
  className,
  value,
  defaultValue,
  onChange,
  ...textFieldProps
}: TextareaProps) {
  const [typedLength, setTypedLength] = useState(() => (defaultValue ?? "").length);
  const count = value !== undefined ? value.length : typedLength;

  return (
    <TextField
      {...textFieldProps}
      value={value}
      defaultValue={defaultValue}
      onChange={(next) => {
        if (showCount && value === undefined) setTypedLength(next.length);
        onChange?.(next);
      }}
      className={className}
      aria-label={
        textFieldProps["aria-label"] ??
        (!label && typeof placeholder === "string" ? placeholder : undefined)
      }
    >
      {({ isRequired, isInvalid }) => (
        <>
          {label && (
            <Label
              isRequired={isRequired}
              isInvalid={isInvalid}
              tooltip={tooltip}
            >
              {label}
            </Label>
          )}
          <TextareaBase
            ref={ref}
            groupRef={groupRef}
            placeholder={placeholder}
            rows={rows}
            autoResize={autoResize}
            maxRows={maxRows}
            resize={resize}
            maxLength={maxLength}
            fieldClassName={fieldClassName}
          />
          {(hint || showCount) && (
            <div className={textareaStyles.footer}>
              {hint && <HintText isInvalid={isInvalid}>{hint}</HintText>}
              {showCount && (
                <span
                  className={cx(
                    textareaStyles.count,
                    isInvalid && "text-text-error-primary",
                  )}
                >
                  {maxLength ? `${count}/${maxLength}` : count}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </TextField>
  );
}

Textarea.displayName = "Textarea";
