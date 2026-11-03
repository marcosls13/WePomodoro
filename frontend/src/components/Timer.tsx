import { useState, useEffect } from "react";

function getFormattedTime(milliseconds) {
    let total_seconds = parseInt(Math.floor(milliseconds/1000));
    let total_minutes = parseInt(Math.floor(total_seconds/60));
    let total_hours = parseInt(Math.floor(total_minutes/60));
    let total_days = parseInt(Math.floor(total_hours/24));

    let seconds = parseInt(total_seconds % 60);
    let minutes = parseInt(total_minutes % 60);
    let hours = parseInt(total_hours % 24);

    const sStr = String(seconds).padStart(2, '0');
    const mStr = String(minutes).padStart(2, '0');
    const hStr = String(hours).padStart(2, '0');
    
    return `${total_days}d : ${hStr}h : ${mStr}m : ${sStr}s`;
};

export default function Timer({ duration, onTimeUp }) {
  const [time, setTime] = useState(duration);

  useEffect(() => {
    if (time <= 0) {
      onTimeUp();
      return;
    }

    const intervalId = setInterval(() => {
      setTime((prevTime) => Math.max(prevTime - 1000, 0));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [time, onTimeUp]);

  return (
     <div>{getFormattedTime(time)}</div>
  );
}
