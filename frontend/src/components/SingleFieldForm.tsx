import { useState } from "react";
import FormWrapper from "./FormWrapper";
import { FormHeader } from "./FormHeader";
import { InputField } from "./InputField";
import { SubmitButton } from "./SubmitButton";
import { errMsg } from "../api";

interface SingleFieldFormProps {
  title: string;
  subtitle: string;
  label: string;
  button: string;
  type?: string;
  placeholder?: string;
  onSubmit: (value: string) => Promise<void>;
  extra?: React.ReactNode;
}

export default function SingleFieldForm({
  title,
  subtitle,
  label,
  button,
  type = "text",
  placeholder,
  onSubmit,
  extra,
}: SingleFieldFormProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      await onSubmit(value);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <div className="flex-grow flex items-center justify-center p-6">
      <FormWrapper>
        <FormHeader title={title} subtitle={subtitle} />
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">
          <InputField
            id="field"
            label={label}
            type={type}
            required
            value={value}
            onChange={(e) => { setValue(e.target.value); }}
            placeholder={placeholder}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <SubmitButton>{button}</SubmitButton>
        </form>
        {extra}
      </FormWrapper>
    </div>
  );
}
