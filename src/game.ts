export type TileState = "correct" | "present" | "absent" | "empty";

export function normalizeWord(value: string) {
  return value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 5);
}

export function scoreGuess(guess: string, target: string): TileState[] {
  const g = guess.toUpperCase().split("");
  const t = target.toUpperCase().split("");
  const result: TileState[] = Array(5).fill("absent");
  const remaining: Record<string, number> = {};

  for (let i = 0; i < 5; i++) {
    if (g[i] === t[i]) {
      result[i] = "correct";
    } else {
      remaining[t[i]] = (remaining[t[i]] ?? 0) + 1;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === "correct") continue;
    const letter = g[i];
    if ((remaining[letter] ?? 0) > 0) {
      result[i] = "present";
      remaining[letter] -= 1;
    }
  }

  return result;
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
