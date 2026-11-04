import { useEffect, useState } from "react";
import { AppState } from "react-native";
const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" });
function greeting() {
  const hour = Number(formatter.format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
export function useManilaGreeting() {
  const [value, setValue] = useState(greeting);
  useEffect(() => {
    const update = () => setValue(greeting());
    const timer = setInterval(update, 60_000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") update(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  return value;
}
