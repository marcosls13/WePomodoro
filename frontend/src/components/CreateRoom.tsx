import { useState } from "react";
import { useNavigate } from "react-router";
import { FormHeader } from "./FormHeader";
import FormWrapper from "./FormWrapper";
import { SubmitButton } from "./SubmitButton";
import TimeInputControl from "./TimeInputControl";
// import { createRoom, joinRoom, type RoomHandle } from "../roomClient";
import { errMsg } from "../api";

export default function CreateRoom() {
  const navigate = useNavigate();
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
//   const [created, setCreated] = useState<RoomHandle | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
}
//   const run = async (action: () => Promise<void>) => {
//     setError("");
//     try {
//       await action();
//     } catch (err) {
//       setError(errMsg(err));
//     }
//   };

//   const create = () =>
//     run(async () => {
//       setCreated(
//         await createRoom({
//           focusSeconds: focusMinutes * 60,
//           breakSeconds: breakMinutes * 60,
//         }),
//       );
//     });

//   const join = () =>
//     run(async () => {
//       const room = await joinRoom(code.trim());
//       void navigate(`/room/${room.code}`);
//     });

//   const copy = async () => {
//     if (!created) return;
//     await navigator.clipboard.writeText(created.code);
//     setCopied(true);
//   };

//   if (created)
//     return (
//       <FormWrapper>
//         <FormHeader title="Room ready" subtitle="Share the code or start studying" />
//         <p className="my-6 select-all text-center font-mono text-4xl tracking-widest text-gray-900 dark:text-white">
//           {created.code}
//         </p>
//         <div className="flex flex-col gap-3">
//           <SubmitButton onClick={() => void copy()}>
//             {copied ? "Copied" : "Copy code"}
//           </SubmitButton>
//           <SubmitButton onClick={() => void navigate(`/room/${created.code}`)}>
//             Start studying
//           </SubmitButton>
//         </div>
//       </FormWrapper>
//     );

//   return (
//     <FormWrapper>
//       <FormHeader title="Study together" subtitle="Create a room or join one" />
//       <div className="flex flex-col gap-4">
//         <div className="grid grid-cols-2 gap-4">
//           <TimeInputControl label="Study (min)" value={focusMinutes} onChange={setFocusMinutes} />
//           <TimeInputControl label="Break (min)" value={breakMinutes} onChange={setBreakMinutes} />
//         </div>
//         <SubmitButton onClick={() => void create()}>Create room</SubmitButton>

//         <div className="flex items-center">
//           <div className="flex-1 border-t border-gray-300" />
//           <span className="mx-3 text-sm text-gray-500">or</span>
//           <div className="flex-1 border-t border-gray-300" />
//         </div>

//         <input
//           type="text"
//           value={code}
//           onChange={(e) => setCode(e.target.value)}
//           placeholder="Room code"
//           className="w-full px-4 py-3 border-2 border-black rounded-full font-mono focus:outline-none focus:border-red-600 placeholder:font-custom dark:text-white"
//         />
//         <SubmitButton onClick={() => void join()}>Join room</SubmitButton>
//         {error && <p className="text-sm text-red-600">{error}</p>}
//       </div>
//     </FormWrapper>
//   );
// }
