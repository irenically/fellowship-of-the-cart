import { useCallback, useEffect, useRef, useState } from "react";
import whispers from "../../data/whispers.json";

export type WhisperType = keyof typeof whispers;
const ROTATION_MS = 90_000;
const COOLDOWN_MS = 30_000;

export function pickWhisper(type: WhisperType, previous = ""): string {
  const lines = whispers[type].map((line) =>
    typeof line === "string" ? line : `${line.title} ${line.subtitle}`,
  );
  const alternatives = lines.filter((line) => line !== previous);
  const pool = alternatives.length ? alternatives : lines;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function useRealmWhisper() {
  const [quote, setQuote] = useState(() => pickWhisper("wisdom"));
  const nextWhisperAt = useRef(0);
  const whisper = useCallback((type: WhisperType) => {
    if (document.hidden || Date.now() < nextWhisperAt.current) return;
    nextWhisperAt.current = Date.now() + COOLDOWN_MS;
    setQuote((previous) => pickWhisper(type, previous));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Leave the page still while someone is typing or editing a provision.
      if (document.activeElement?.closest("input, textarea, select, .editor"))
        return;
      whisper("wisdom");
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [whisper]);

  return { quote, whisper };
}
