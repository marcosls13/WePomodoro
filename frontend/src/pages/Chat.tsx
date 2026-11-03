import {useState, useCallback} from 'react'
import {motion, AnimatePresence } from 'motion/react'
import Timer from '../components/Timer'

export default function Chat() {
  const [isRestTime, setIsRestTime] = useState(false);

  const WORK_DURATION = 0.0001 * 24 * 60 * 60 * 1000;  
  const REST_DURATION = 0.00005 * 24 * 60 * 60 * 1000;

  const handleTimerEnd = useCallback(() => {
     setIsRestTime((prev) => !prev);
  }, []);

  const smoothTransition = {
    type: "spring",
    bounce: 0,
    duration: 0.8
  };

  return (
    <div className="flex flex-grow gap-3 m-6">
      <motion.div
        layout
        transition={smoothTransition}
        className="flex flex-1  shadow-lg rounded-lg items-center justify-center"
      >
        <Timer 
          key={isRestTime ? "rest-timer" : "work-timer"}
          duration={isRestTime ? REST_DURATION : WORK_DURATION} 
          onTimeUp={handleTimerEnd}
        />
      </motion.div>
      
      <AnimatePresence mode="popLayout">
        {isRestTime && (
          <motion.div
            key="panel-create"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0}}
            transition={smoothTransition}
            className="flex flex-1 shadow-lg rounded-lg items-center justify-center"
          >
            hi
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
