import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Timer from '../components/Timer'
import Chat from '../components/Chat'
import TimeConfig from '../components/TimeConfig'

export default function Room() {
  const [roomConfig, setRoomConfig] = useState(null);
  const [isRestTime, setIsRestTime] = useState(false);

  const handleStartRoom = ({ workDuration, restDuration }) => {
    setRoomConfig({ workDuration, restDuration });
  };

  const handleTimerEnd = useCallback(() => {
     setIsRestTime((prev) => !prev);
  }, []);

  const smoothTransition = {
    type: "spring",
    bounce: 0.1,
    duration: 0.7
  };

  if (!roomConfig) {
    return (
      <div className="flex flex-grow items-center justify-center bg-gray-50 p-6">
        <TimeConfig onStartRoom={handleStartRoom} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-grow w-full min-h-[450px] overflow-hidden m-6 bg-white rounded-3xl"> 
      <AnimatePresence>
        {isRestTime && (
          <motion.div
            key="panel-create"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={smoothTransition}
            className="absolute inset-0 flex items-center justify-center z-30"
          >
	  <Chat/>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        layout
        transition={smoothTransition}
        className={`flex rounded-2xl items-center justify-center bg-white z-40 ${
          isRestTime 
            ? "fixed top-4 left-4 px-4 py-2 text-sm shadow-md"
            : "fixed inset-12 m-auto w-fit h-fit text-9xl font-custom-timer"   // Estado centrado y dimensionado
        }`}
      >
        <Timer 
          key={isRestTime ? `rest-${roomConfig.restDuration}` : `work-${roomConfig.workDuration}`}
          duration={isRestTime ? roomConfig.restDuration : roomConfig.workDuration} 
          onTimeUp={handleTimerEnd}
        />
      </motion.div>
      
    </div>
  );
}
