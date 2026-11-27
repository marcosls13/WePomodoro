import { useState } from "react";
import { api, errMsg } from "../api";
import { PasswordField } from "./PasswordField";
import { SubmitButton } from "./SubmitButton";

export default function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    const fail = (text: string) => {
      setFailed(true);
      setMessage(text);
    };
    if (next.length < 8 || next.length > 128) {
      fail("The new password must be 8–128 characters.");
      return;
    }
    if (next !== repeat) {
      fail("The new passwords do not match.");
      return;
    }
    try {
      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: current, password: next }),
      });
      setCurrent("");
      setNext("");
      setRepeat("");
      setFailed(false);
      setMessage("Password changed. Your other devices were logged out.");
    } catch (err) {
      fail(errMsg(err));
    }
  };

  return (
    <section className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6 pb-3 border-b border-gray-100 dark:border-slate-800">
        Change password
      </h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <PasswordField
          id="current-password"
          label="Current password"
          required
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
          }}
        />
        <PasswordField
          id="new-password"
          label="New password"
          required
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
          }}
        />
        <PasswordField
          id="repeat-password"
          label="Repeat the new password"
          required
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
          }}
        />
        {message && (
          <p
            className={
              failed
                ? "text-sm text-red-600"
                : "text-sm text-gray-700 dark:text-gray-300"
            }
          >
            {message}
          </p>
        )}
        <SubmitButton>Change password</SubmitButton>
      </form>
    </section>
  );
}
