import { useState, useEffect } from "react";

function getFormattedTime(milliseconds: number) {
  const total_seconds = Math.floor(milliseconds / 1000);
  const total_minutes = Math.floor(total_seconds / 60);
  const total_hours = Math.floor(total_minutes / 60);

  const seconds = total_seconds % 60;
  const minutes = total_minutes % 60;
  const hours = total_hours % 24;

  const sStr = String(seconds).padStart(2, "0");
  const mStr = String(minutes).padStart(2, "0");
  const hStr = String(hours).padStart(2, "0");

  return `${hStr}h : ${mStr}m : ${sStr}s`;
}

export default function Timer({
  duration,
  onTimeUp
}: {
  duration: number;
  onTimeUp: () => void;
}) {
  const [time, setTime] = useState(duration);

  useEffect(() => {
    if (time <= 0) {
      onTimeUp();
      return;
    }

    const intervalId = setInterval(() => {
      setTime((prevTime: number) => Math.max(prevTime - 1000, 0));
    }, 1000);

    return () => { clearInterval(intervalId); };
  }, [time, onTimeUp]);

  return (
    <>
      <p className="dark:text-white dark:bg-slate-900">
        {getFormattedTime(time)}
      </p>
    </>
  );
}
