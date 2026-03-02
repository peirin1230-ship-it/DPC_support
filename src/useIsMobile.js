import { useState, useEffect } from "react";

const MQ = "(max-width:768px)";

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MQ).matches);
  useEffect(() => {
    const mql = window.matchMedia(MQ);
    const handler = e => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}
