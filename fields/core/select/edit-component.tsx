"use client";

import { useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";

type Option = {
  value: string;
  label: string;
};

const normalizeOption = (option: any): Option => {
  if (typeof option === "object" && option !== null) {
    const value = option.value ?? option.name;
    return {
      value: String(value ?? ""),
      label: String(option.label ?? value ?? ""),
    };
  }

  return { value: String(option), label: String(option) };
};

const EditComponent = (props: any) => {
  const { value, field, onChange } = props;
  const isReadonly = Boolean(field?.readonly);
  const multiple = Boolean(field.options?.multiple);
  const creatable = Boolean(field.options?.creatable);
  const storeAsObject =
    field?.type === "reference" && field.options?.store === "object";
  const anchor = useComboboxAnchor();
  const [inputValue, setInputValue] = useState("");

  // The static options defined in the field schema
  const baseOptions = useMemo(
    () =>
      Array.isArray(field.options?.values)
        ? field.options.values.map(normalizeOption)
        : [],
    [field.options?.values],
  );

  // When creatable, also include any already-selected free-form values that
  // aren't in the static list, so they display correctly when the form loads.
  const options = useMemo(() => {
    if (!creatable) return baseOptions;

    const existingValues = new Set(baseOptions.map((o: Option) => o.value));
    const selectedItems = multiple
      ? (Array.isArray(value) ? value : [])
      : (value != null && value !== "" ? [value] : []);

    const extra: Option[] = selectedItems
      .map((v: any) =>
        typeof v === "object" && v !== null ? normalizeOption(v) : { value: String(v), label: String(v) }
      )
      .filter((o: Option) => o.value !== "" && !existingValues.has(o.value));

    return extra.length > 0 ? [...baseOptions, ...extra] : baseOptions;
  }, [baseOptions, creatable, value, multiple]);

  // Synthetic "Create …" option shown when the typed value doesn't match anything
  const createOption = useMemo<Option | null>(() => {
    if (!creatable || !inputValue.trim()) return null;
    const trimmed = inputValue.trim();
    const alreadyExists = options.some(
      (o: Option) => o.value.toLowerCase() === trimmed.toLowerCase(),
    );
    return alreadyExists ? null : { value: trimmed, label: `Create "${trimmed}"` };
  }, [creatable, inputValue, options]);

  // Full list passed to the Combobox
  const allOptions = useMemo(
    () => (createOption ? [...options, createOption] : options),
    [options, createOption],
  );

  const selectedValue = useMemo(() => {
    if (multiple) {
      const values = Array.isArray(value) ? value : [];
      return values.map((item) => {
        const option =
          typeof item === "object" && item !== null
            ? normalizeOption(item)
            : null;
        const optionValue = option?.value ?? String(item);
        return (
          options.find((candidate: Option) => candidate.value === optionValue) ??
          option ??
          normalizeOption(item)
        );
      });
    }

    if (value === null || value === undefined || value === "") {
      return null;
    }

    const option =
      typeof value === "object" && value !== null
        ? normalizeOption(value)
        : null;
    const optionValue = option?.value ?? String(value);
    return (
      options.find((candidate: Option) => candidate.value === optionValue) ??
      option ??
      normalizeOption(value)
    );
  }, [multiple, options, value]);

  const placeholder = isReadonly
    ? undefined
    : field.options?.placeholder || "Select...";

  const handleValueChange = (nextValue: Option[] | Option | null) => {
    if (isReadonly) return;
    setInputValue("");
    const toOutput = (option: Option) =>
      storeAsObject ? option : option.value;

    if (multiple) {
      onChange(Array.isArray(nextValue) ? nextValue.map(toOutput) : []);
      return;
    }

    onChange(nextValue ? toOutput(nextValue as Option) : null);
  };

  const filterFn =  (option: Option, inputVal: string) => {
    // Always show the create option, let others match by label
    if (creatable && createOption && option.value === createOption.value) {
      // show "Create..." if it should be shown
      return true;
    }
    // Standard case-insensitive substring match for filtering
    return option.label.toLowerCase().includes(inputVal.trim().toLowerCase());
  };

  return (
    <Combobox
      items={allOptions}
      multiple={multiple}
      value={selectedValue as any}
      onValueChange={handleValueChange as any}
      onInputValueChange={creatable && !isReadonly ? setInputValue : undefined}
      readOnly={isReadonly}
      isItemEqualToValue={(item, selected) => item.value === selected?.value}
      autoHighlight
      filter={filterFn}
    >
      {multiple ? (
        <>
          <ComboboxChips
            ref={anchor}
            className={cn(
              isReadonly && "focus-within:border-input focus-within:ring-0",
            )}
          >
            <ComboboxValue>
              {(values: Option[]) => (
                <>
                  {values.map((option) => (
                    <ComboboxChip key={option.value} showRemove={!isReadonly}>
                      {option.label}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    placeholder={placeholder}
                    readOnly={isReadonly}
                    className={cn(isReadonly && "cursor-default")}
                  />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No options found.</ComboboxEmpty>
            <ComboboxList>
              {(option: Option) => (
                <ComboboxItem key={option.value} value={option}>
                  {creatable && option.value === createOption?.value ? (
                    <>
                      <PlusIcon className="mr-1 size-3.5 shrink-0" />
                      {option.label}
                    </>
                  ) : (
                    option.label
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </>
      ) : (
        <>
          <ComboboxInput
            placeholder={placeholder}
            className={cn(isReadonly && "has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0")}
            showTrigger={!isReadonly}
            readOnly={isReadonly}
          />
          <ComboboxContent>
            <ComboboxEmpty>No options found.</ComboboxEmpty>
            <ComboboxList>
              {(option: Option) => (
                <ComboboxItem key={option.value} value={option}>
                  {creatable && option.value === createOption?.value ? (
                    <>
                      <PlusIcon className="mr-1 size-3.5 shrink-0" />
                      {option.label}
                    </>
                  ) : (
                    option.label
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </>
      )}
    </Combobox>
  );
};

export { EditComponent };
