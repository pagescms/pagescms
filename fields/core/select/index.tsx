import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";

const schema = (field: Field) => {
  const creatable = Boolean(field.options?.creatable);
  const normalizedValues = Array.isArray(field.options?.values)
    ? field.options.values.map((item) => (
        typeof item === "object"
          ? String(item.value ?? item.name ?? "")
          : String(item)
      ))
    : [];
  const min = typeof field.options?.min === "number" ? field.options.min : undefined;
  const max = typeof field.options?.max === "number" ? field.options.max : undefined;

  const optionSchema = creatable
    ? z.string()
    : z.string().refine(
        (value) => normalizedValues.includes(value),
        { message: normalizedValues.length === 0 ? "This select field requires options.values" : "Invalid option" }
      );

  if (field.options?.multiple) {
    let zodSchema = z.array(optionSchema);

    if (field.required) zodSchema = zodSchema.min(1, "This field is required");
    if (min !== undefined) zodSchema = zodSchema.min(min, `Select at least ${min} option${min === 1 ? "" : "s"}`);
    if (max !== undefined) zodSchema = zodSchema.max(max, `Select at most ${max} option${max === 1 ? "" : "s"}`);

    return z.preprocess(
      (val) => {
        if (val === "" || val === null || val === undefined) return [];
        return Array.isArray(val) ? val.map(String) : val;
      },
      zodSchema
    );
  }

  return z.preprocess(
    (val) => (val === null || val === undefined ? "" : val),
    field.required
      ? optionSchema
      : z.union([z.literal(""), optionSchema]).optional()
  );
};

const label = "Select";

export { label, schema, EditComponent };
