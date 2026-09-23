export type PlayerId = "a" | "b";

export type Player = {
  id: PlayerId;
  name: string;
};

export type Guess = {
  word: string;
  submittedAt: number;
};

export type PuzzleResult = {
  playerId: PlayerId;
  target: string;
  guesses: Guess[];
  solved: boolean;
  finished: boolean;
};

export type DailyGame = {
  dateKey: string;
  words: Partial<Record<PlayerId, string>>;
  results: Partial<Record<PlayerId, PuzzleResult>>;
  completed: boolean;
};

export type AppState = {
  onboarded: boolean;
  players: {
    a: Player;
    b: Player;
  };
  games: Record<string, DailyGame>;
  streak: number;
};
