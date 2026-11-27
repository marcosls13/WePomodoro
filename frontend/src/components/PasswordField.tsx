import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { InputField } from "./InputField";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  required,
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <InputField
        id={id}
        label={label}
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={onChange}
        required={required}
        style={{ paddingRight: "3rem" }}
      />
      {/* The input is 46px high and is the last child, so bottom-0 + h-[46px] centres the eye on it. */}
      <button
        type="button"
        onClick={() => {
          setShowPassword((prev) => !prev);
        }}
        aria-label={showPassword ? "Hide password" : "Show password"}
        className="absolute bottom-0 right-4 flex h-[46px] items-center text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white cursor-pointer"
      >
        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  );
}
