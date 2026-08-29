import type { Capability } from "../../types";
import { Card } from "../../shared/ui/Card";
import { Field } from "../../shared/ui/Field";
import { Checkbox } from "../../shared/ui/Checkbox";
import { Input } from "../../shared/ui/Input";
import { Select } from "../../shared/ui/Select";

type CapabilityField = { name: string; type?: unknown; default?: unknown; label?: unknown; options?: unknown[]; min?: unknown; max?: unknown };

export function CapabilitySettings({ capability, settings, onChange }: { capability: Capability; settings: Record<string, unknown>; onChange: (settings: Record<string, unknown>) => void }) {
  const schema = capability.parameters;
  const fields: CapabilityField[] = Array.isArray(schema)
    ? schema.map((item) => ({ name: String(item.name ?? item.key ?? "setting"), ...item }))
    : Object.entries(schema ?? {}).map(([name, value]) => ({ name, ...(typeof value === "object" && value !== null ? value : { default: value }) }));
  if (!fields.length) return null;

  return <Card className="capability-settings"><div className="settings-label">Generation settings</div>{fields.map((field) => { const type = String(field.type ?? (typeof field.default === "number" ? "number" : "text")); const value = settings[field.name] ?? field.default ?? ""; const setValue = (next: unknown) => onChange({ ...settings, [field.name]: next }); const label = String(field.label ?? field.name); return <Field key={field.name} label={label}>{type === "boolean" ? <Checkbox checked={Boolean(value)} onChange={(event) => setValue(event.target.checked)} /> : Array.isArray(field.options) ? <Select value={String(value)} onChange={(event) => setValue(event.target.value)}>{field.options.map((option: unknown) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</Select> : <Input type={type === "number" || type === "integer" ? "number" : "text"} value={String(value)} min={field.min as number | undefined} max={field.max as number | undefined} step={type === "integer" ? 1 : "any"} onChange={(event) => setValue(type === "number" || type === "integer" ? Number(event.target.value) : event.target.value)} />}</Field>; })}</Card>;
}
