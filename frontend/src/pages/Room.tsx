import { useState, useCallback } from "react";
import { motion, AnimatePresence, type Transition } from "motion/react";
import Timer from "../components/Timer";
import Chat from "../components/Chat";
import Games from "../components/Games";
import TimeConfig from "../components/TimeConfig";

interface RoomConfig {
  workDuration: number;
  restDuration: number;
}

export default function Room({
  initialConfig,
}: {
  initialConfig?: RoomConfig;
}) {
  const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(
    initialConfig ?? null,
  );
  const [isRestTime, setIsRestTime] = useState(false);

  const handleStartRoom = ({
    workDuration,
    restDuration,
  }: {
    workDuration: number;
    restDuration: number;
  }) => {
    setRoomConfig({ workDuration, restDuration });
  };

  const handleTimerEnd = useCallback(() => {
    setIsRestTime((prev) => !prev);
  }, []);

  const smoothTransition: Transition = {
    type: "spring",
    bounce: 0.1,
    duration: 0.7,
  };

  if (!roomConfig) {
    return (
      <div className="flex w-full items-center justify-center bg-gray-50 dark:bg-slate-950">
        <TimeConfig onStartRoom={handleStartRoom} />
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {isRestTime && (
          <motion.div
            key="panel-create"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={smoothTransition}
            className="flex flex-col w-full h-dvh p-6 gap-4 md:flex-row items-center justify-center border"
          >
            <Games />
            <Chat />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        layout
        transition={smoothTransition}
        className={`flex rounded-2xl items-center justify-center bg-white z-40 dark:bg-slate-900 ${
          isRestTime
            ? "fixed top-4 left-4 px-4 py-2 text-sm shadow-md border border-gray-100"
            : "fixed inset-12 m-auto w-fit h-fit text-9xl font-custom-timer" // Estado centrado y dimensionado
        }`}
      >
        <Timer
          key={
            isRestTime
              ? `rest-${String(roomConfig.restDuration)}`
              : `work-${String(roomConfig.workDuration)}`
          }
          duration={
            isRestTime ? roomConfig.restDuration : roomConfig.workDuration
          }
          onTimeUp={handleTimerEnd}
        />
      </motion.div>
    </>
  );
}
