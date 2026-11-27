import { useNavigate } from "react-router";
import { useNoticeStore } from "../store/noticeStore";

// Shown when an administrator removed the account or guest, or the session
// ended. api.ts has already forgotten the identity; the button goes to the start.
export default function EjectedNotice() {
  const ejected = useNoticeStore((s) => s.ejected);
  const clear = useNoticeStore((s) => s.clear);
  const navigate = useNavigate();

  if (!ejected) return null;

  return (
    <div
      role="alert"
      className="fixed top-4 left-1/2 z-[60] flex w-[min(92vw,28rem)] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
    >
      <div>
        <p className="font-bold text-gray-900 dark:text-white">
          You have been ejected
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          An administrator removed your account or guest, or your session ended.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          clear();
          void navigate("/");
        }}
        className="self-end rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 cursor-pointer"
      >
        Back to the start
      </button>
    </div>
  );
}
