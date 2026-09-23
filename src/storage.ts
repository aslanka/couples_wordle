import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "./types";

const KEY = "pairle-state-v1";

export const defaultState: AppState = {
  onboarded: false,
  players: {
    a: { id: "a", name: "You" },
    b: { id: "b", name: "Partner" }
  },
  games: {},
  streak: 0
};

export async function loadState(): Promise<AppState> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return defaultState;
  try {
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
}

export async function saveState(state: AppState) {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export async function resetState() {
  await AsyncStorage.removeItem(KEY);
}
