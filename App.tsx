import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { AppState, DailyGame, PlayerId, PuzzleResult } from "./src/types";
import { defaultState, loadState, resetState, saveState } from "./src/storage";
import { normalizeWord, scoreGuess, TileState, todayKey } from "./src/game";

const MAX_GUESSES = 6;

type Screen =
  | { name: "home" }
  | { name: "setWord"; setter: PlayerId }
  | { name: "handoff"; next: PlayerId }
  | { name: "play"; player: PlayerId }
  | { name: "history" };

export default function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  useEffect(() => {
    loadState().then((s) => {
      setState(s);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading) saveState(state);
  }, [state, loading]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!state.onboarded) {
    return <Onboarding onDone={(a, b) => setState({
      ...state,
      onboarded: true,
      players: {
        a: { id: "a", name: a },
        b: { id: "b", name: b }
      }
    })} />;
  }

  const props = { state, setState, setScreen };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      {screen.name === "home" && <Home {...props} />}
      {screen.name === "setWord" && <SetWord {...props} setter={screen.setter} />}
      {screen.name === "handoff" && <Handoff {...props} next={screen.next} />}
      {screen.name === "play" && <Play {...props} player={screen.player} />}
      {screen.name === "history" && <History {...props} />}
    </SafeAreaView>
  );
}

function Onboarding({ onDone }: { onDone: (a: string, b: string) => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.brandPill}><Text style={styles.brandPillText}>PAIRLE</Text></View>
        <Text style={styles.hero}>A daily word made{"\n"}just for each other.</Text>
        <Text style={styles.sub}>
          Each of you secretly chooses a five-letter word. Then swap the phone and solve.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>YOUR NAME</Text>
          <TextInput
            value={a}
            onChangeText={setA}
            placeholder="Ayush"
            style={styles.input}
            autoCapitalize="words"
          />
          <Text style={[styles.label, { marginTop: 18 }]}>PARTNER'S NAME</Text>
          <TextInput
            value={b}
            onChangeText={setB}
            placeholder="Partner"
            style={styles.input}
            autoCapitalize="words"
          />
        </View>

        <PrimaryButton
          title="Start Pairle"
          onPress={() => onDone(a.trim() || "You", b.trim() || "Partner")}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type CommonProps = {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
};

function useToday(state: AppState): DailyGame {
  const key = todayKey();
  return state.games[key] ?? { dateKey: key, words: {}, results: {}, completed: false };
}

function Home({ state, setState, setScreen }: CommonProps) {
  const game = useToday(state);
  const aWord = !!game.words.a;
  const bWord = !!game.words.b;
  const aResult = game.results.a;
  const bResult = game.results.b;

  const phase =
    !aWord ? "setupA" :
    !bWord ? "setupB" :
    !aResult?.finished ? "playA" :
    !bResult?.finished ? "playB" :
    "done";

  const phaseButton = () => {
    if (phase === "setupA") setScreen({ name: "setWord", setter: "a" });
    if (phase === "setupB") setScreen({ name: "setWord", setter: "b" });
    if (phase === "playA") setScreen({ name: "handoff", next: "a" });
    if (phase === "playB") setScreen({ name: "handoff", next: "b" });
  };

  const phaseText = {
    setupA: `${state.players.a.name}, choose today's word`,
    setupB: `${state.players.b.name}, choose today's word`,
    playA: `${state.players.a.name}'s puzzle is ready`,
    playB: `${state.players.b.name}'s puzzle is ready`,
    done: "Today's Pairle is complete"
  }[phase];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.logo}>Pairle</Text>
          <Text style={styles.muted}>{prettyDate()}</Text>
        </View>
        <View style={styles.streakPill}>
          <Text style={styles.streakText}>🔥 {state.streak}</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>TODAY'S PAIRLE</Text>
        <Text style={styles.cardHero}>{phaseText}</Text>
        <Text style={styles.sub}>
          {phase === "done"
            ? `${summaryText(aResult, state.players.a.name)} · ${summaryText(bResult, state.players.b.name)}`
            : "A tiny daily ritual, made by the two of you."}
        </Text>

        {phase !== "done" ? (
          <PrimaryButton title={
            phase === "setupA" || phase === "setupB" ? "Choose secret word" : "Play puzzle"
          } onPress={phaseButton} />
        ) : (
          <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>✓ DONE FOR TODAY</Text></View>
        )}
      </View>

      <View style={styles.twoCol}>
        <PlayerCard
          name={state.players.a.name}
          wordSet={aWord}
          finished={!!aResult?.finished}
          guesses={aResult?.guesses.length}
          solved={aResult?.solved}
        />
        <PlayerCard
          name={state.players.b.name}
          wordSet={bWord}
          finished={!!bResult?.finished}
          guesses={bResult?.guesses.length}
          solved={bResult?.solved}
        />
      </View>

      <Pressable style={styles.secondaryButton} onPress={() => setScreen({ name: "history" })}>
        <Text style={styles.secondaryButtonText}>View history</Text>
      </Pressable>

      <Pressable
        style={{ paddingVertical: 16 }}
        onPress={() => Alert.alert(
          "Reset demo?",
          "This clears names, history, and today's game.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Reset",
              style: "destructive",
              onPress: async () => {
                await resetState();
                setState(defaultState);
              }
            }
          ]
        )}
      >
        <Text style={styles.resetText}>Reset demo</Text>
      </Pressable>
    </ScrollView>
  );
}

function SetWord({ state, setState, setScreen, setter }: CommonProps & { setter: PlayerId }) {
  const [word, setWord] = useState("");
  const setterName = state.players[setter].name;
  const solver: PlayerId = setter === "a" ? "b" : "a";
  const solverName = state.players[solver].name;

  function save() {
    const clean = normalizeWord(word);
    if (clean.length !== 5) {
      Alert.alert("Five letters only", "Choose a five-letter word.");
      return;
    }

    const key = todayKey();
    setState((prev) => {
      const current = prev.games[key] ?? { dateKey: key, words: {}, results: {}, completed: false };
      return {
        ...prev,
        games: {
          ...prev.games,
          [key]: { ...current, words: { ...current.words, [setter]: clean } }
        }
      };
    });

    if (setter === "a") {
      setScreen({ name: "handoff", next: "b" });
    } else {
      setScreen({ name: "home" });
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Back onPress={() => setScreen({ name: "home" })} />
      <Text style={styles.eyebrow}>SECRET WORD</Text>
      <Text style={styles.hero}>{setterName}, pick a word for {solverName}.</Text>
      <Text style={styles.sub}>
        Make it personal, funny, mean, or tied to something from today.
      </Text>

      <View style={styles.wordEntry}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View style={[styles.bigTile, word[i] ? styles.bigTileFilled : null]} key={i}>
            <Text style={styles.bigTileText}>{word[i]?.toUpperCase() ?? ""}</Text>
          </View>
        ))}
      </View>

      <TextInput
        value={word}
        onChangeText={(v) => setWord(normalizeWord(v))}
        maxLength={5}
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.hiddenInput}
        autoFocus
      />

      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>Keep it secret 🤫</Text>
        <Text style={styles.tipText}>
          Once you lock it in, hand the phone over. {solverName} won't see the word.
        </Text>
      </View>

      <PrimaryButton title="Lock it in" onPress={save} disabled={word.length !== 5} />
    </KeyboardAvoidingView>
  );
}

function Handoff({ state, setScreen, next }: CommonProps & { next: PlayerId }) {
  const name = state.players[next].name;
  const nextAction =
    !state.games[todayKey()]?.words[next]
      ? () => setScreen({ name: "setWord", setter: next })
      : () => setScreen({ name: "play", player: next });

  return (
    <View style={[styles.page, styles.centerContent]}>
      <Text style={{ fontSize: 64 }}>🙈</Text>
      <Text style={[styles.hero, { textAlign: "center" }]}>Pass the phone to{"\n"}{name}</Text>
      <Text style={[styles.sub, { textAlign: "center" }]}>
        Don't peek. The next screen contains something meant only for {name}.
      </Text>
      <PrimaryButton title={`I'm ${name}`} onPress={nextAction} />
    </View>
  );
}

function Play({ state, setState, setScreen, player }: CommonProps & { player: PlayerId }) {
  const game = useToday(state);
  const creator: PlayerId = player === "a" ? "b" : "a";
  const target = game.words[creator];

  const existing = game.results[player] ?? {
    playerId: player,
    target: target ?? "",
    guesses: [],
    solved: false,
    finished: false
  };

  const [result, setResult] = useState<PuzzleResult>(existing);
  const [draft, setDraft] = useState("");

  if (!target) {
    return (
      <View style={styles.page}>
        <Text style={styles.hero}>No puzzle yet.</Text>
        <PrimaryButton title="Back home" onPress={() => setScreen({ name: "home" })} />
      </View>
    );
  }

  function submit() {
    const clean = normalizeWord(draft);
    if (clean.length !== 5) {
      Alert.alert("Five letters only");
      return;
    }
    const guesses = [...result.guesses, { word: clean, submittedAt: Date.now() }];
    const solved = clean === target;
    const finished = solved || guesses.length >= MAX_GUESSES;
    const next = { ...result, target, guesses, solved, finished };
    setResult(next);
    setDraft("");

    setState((prev) => {
      const key = todayKey();
      const current = prev.games[key];
      if (!current) return prev;

      const results = { ...current.results, [player]: next };
      const bothFinished = !!results.a?.finished && !!results.b?.finished;
      const wasCompleted = current.completed;

      return {
        ...prev,
        streak: bothFinished && !wasCompleted ? prev.streak + 1 : prev.streak,
        games: {
          ...prev.games,
          [key]: { ...current, results, completed: bothFinished }
        }
      };
    });

    if (finished) {
      setTimeout(() => {
        Alert.alert(
          solved ? "Nice 🎉" : "Oof 😅",
          solved
            ? `You got ${state.players[creator].name}'s word in ${guesses.length}.`
            : `The word was ${target}.`,
          [{ text: "Continue", onPress: () => setScreen({ name: "home" }) }]
        );
      }, 100);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.headerRow}>
        <Back onPress={() => setScreen({ name: "home" })} />
        <Text style={styles.muted}>{result.guesses.length}/{MAX_GUESSES}</Text>
      </View>

      <Text style={styles.eyebrow}>MADE BY {state.players[creator].name.toUpperCase()}</Text>
      <Text style={styles.sectionTitle}>{state.players[player].name}'s Pairle</Text>

      <View style={styles.board}>
        {Array.from({ length: MAX_GUESSES }).map((_, row) => {
          const guess = result.guesses[row]?.word ?? (row === result.guesses.length ? draft : "");
          const states =
            result.guesses[row] ? scoreGuess(result.guesses[row].word, target) : Array(5).fill("empty");
          return (
            <View style={styles.row} key={row}>
              {Array.from({ length: 5 }).map((__, col) => (
                <Tile key={col} letter={guess[col] ?? ""} state={states[col] as TileState} />
              ))}
            </View>
          );
        })}
      </View>

      {!result.finished && (
        <>
          <TextInput
            value={draft}
            onChangeText={(v) => setDraft(normalizeWord(v))}
            maxLength={5}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.guessInput}
            placeholder="TYPE YOUR GUESS"
          />
          <PrimaryButton title="Submit guess" onPress={submit} disabled={draft.length !== 5} />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function Tile({ letter, state }: { letter: string; state: TileState }) {
  return (
    <View style={[
      styles.tile,
      state === "correct" && styles.correct,
      state === "present" && styles.present,
      state === "absent" && styles.absent,
    ]}>
      <Text style={[styles.tileText, state !== "empty" && { color: "white" }]}>{letter}</Text>
    </View>
  );
}

function History({ state, setScreen }: CommonProps) {
  const games = Object.values(state.games)
    .filter((g) => g.completed)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Back onPress={() => setScreen({ name: "home" })} />
      <Text style={styles.eyebrow}>YOUR STORY</Text>
      <Text style={styles.hero}>Pairle history</Text>
      <Text style={styles.sub}>Every word becomes a tiny timestamp from your relationship.</Text>

      {games.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing here yet.</Text>
          <Text style={styles.muted}>Finish today's Pairle and it'll show up here.</Text>
        </View>
      ) : games.map((g) => (
        <View style={styles.historyCard} key={g.dateKey}>
          <Text style={styles.historyDate}>{g.dateKey}</Text>
          <View style={styles.historyRow}>
            <HistorySide
              name={state.players.a.name}
              result={g.results.a}
              receivedFrom={state.players.b.name}
            />
            <HistorySide
              name={state.players.b.name}
              result={g.results.b}
              receivedFrom={state.players.a.name}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function HistorySide({ name, result, receivedFrom }: {
  name: string;
  result?: PuzzleResult;
  receivedFrom: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.historyName}>{name}</Text>
      <Text style={styles.historyWord}>{result?.target ?? "—"}</Text>
      <Text style={styles.muted}>
        {result?.solved ? `${result.guesses.length} guesses` : "not solved"} · by {receivedFrom}
      </Text>
    </View>
  );
}

function PlayerCard({ name, wordSet, finished, guesses, solved }: {
  name: string;
  wordSet: boolean;
  finished: boolean;
  guesses?: number;
  solved?: boolean;
}) {
  return (
    <View style={styles.playerCard}>
      <Text style={styles.playerName}>{name}</Text>
      <Text style={styles.playerStatus}>
        {finished ? (solved ? `Solved in ${guesses}` : "Missed it") : wordSet ? "Word locked ✓" : "Waiting"}
      </Text>
    </View>
  );
}

function PrimaryButton({ title, onPress, disabled = false }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && { opacity: 0.35 },
        pressed && !disabled && { transform: [{ scale: 0.99 }] }
      ]}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.back}>
      <Text style={styles.backText}>‹ Back</Text>
    </Pressable>
  );
}

function prettyDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function summaryText(result: PuzzleResult | undefined, name: string) {
  if (!result) return `${name}: —`;
  if (!result.solved) return `${name}: missed`;
  return `${name}: ${result.guesses.length}/6`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F4EE" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F4EE" },
  centerContent: { justifyContent: "center" },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 36, backgroundColor: "#F7F4EE" },

  brandPill: { alignSelf: "flex-start", backgroundColor: "#171717", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 22 },
  brandPillText: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  logo: { fontSize: 30, fontWeight: "900", letterSpacing: -1.3, color: "#171717" },
  hero: { fontSize: 38, lineHeight: 42, fontWeight: "900", letterSpacing: -1.5, color: "#171717", marginTop: 8 },
  sectionTitle: { fontSize: 30, fontWeight: "900", letterSpacing: -1, color: "#171717", marginBottom: 18 },
  sub: { fontSize: 16, lineHeight: 24, color: "#666158", marginTop: 12, marginBottom: 22 },
  muted: { fontSize: 13, color: "#827C72" },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.6, color: "#7A7469", marginTop: 12 },

  card: { backgroundColor: "#fff", borderRadius: 24, padding: 18, marginVertical: 24, borderWidth: 1, borderColor: "#E8E2D8" },
  label: { fontSize: 11, fontWeight: "900", letterSpacing: 1.3, color: "#787167" },
  input: { marginTop: 8, fontSize: 18, fontWeight: "700", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#DED8CD", color: "#171717" },

  primaryButton: { backgroundColor: "#171717", minHeight: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 10 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  secondaryButton: { borderWidth: 1.5, borderColor: "#CCC4B7", minHeight: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 18 },
  secondaryButtonText: { fontSize: 15, fontWeight: "800", color: "#27231F" },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  streakPill: { backgroundColor: "#FFF", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#E8E2D8" },
  streakText: { fontWeight: "900", color: "#171717" },

  heroCard: { marginTop: 28, borderRadius: 28, padding: 22, backgroundColor: "#E9F1C9", borderWidth: 1, borderColor: "#D8E4AB" },
  cardHero: { fontSize: 28, lineHeight: 32, fontWeight: "900", letterSpacing: -1, color: "#171717", marginTop: 8 },
  doneBadge: { alignSelf: "flex-start", paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: "#D0E58B", marginTop: 4 },
  doneBadgeText: { fontWeight: "900", fontSize: 11, letterSpacing: 1 },

  twoCol: { flexDirection: "row", gap: 12, marginTop: 14 },
  playerCard: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E8E2D8", padding: 16, borderRadius: 20 },
  playerName: { fontSize: 16, fontWeight: "900", color: "#171717" },
  playerStatus: { marginTop: 6, fontSize: 13, color: "#6C665D" },
  resetText: { textAlign: "center", color: "#9A6F69", fontWeight: "700" },

  wordEntry: { flexDirection: "row", justifyContent: "space-between", marginTop: 28, marginBottom: 12 },
  bigTile: { width: "18%", aspectRatio: 0.85, borderRadius: 13, borderWidth: 2, borderColor: "#D8D1C5", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  bigTileFilled: { borderColor: "#171717" },
  bigTileText: { fontSize: 28, fontWeight: "900", color: "#171717" },
  hiddenInput: { opacity: 0.02, height: 4 },
  tipCard: { backgroundColor: "#FFF3D8", borderRadius: 20, padding: 17, marginTop: 26, marginBottom: 12, borderWidth: 1, borderColor: "#F2DFAE" },
  tipTitle: { fontSize: 15, fontWeight: "900", color: "#2A241B" },
  tipText: { marginTop: 5, color: "#716551", lineHeight: 20 },

  board: { gap: 7, marginBottom: 18 },
  row: { flexDirection: "row", justifyContent: "center", gap: 7 },
  tile: { width: 52, height: 52, borderWidth: 2, borderColor: "#D8D1C5", borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  tileText: { fontSize: 23, fontWeight: "900", color: "#171717" },
  correct: { backgroundColor: "#6AAA64", borderColor: "#6AAA64" },
  present: { backgroundColor: "#C9B458", borderColor: "#C9B458" },
  absent: { backgroundColor: "#787C7E", borderColor: "#787C7E" },
  guessInput: { minHeight: 54, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#D7D0C4", paddingHorizontal: 16, textAlign: "center", fontSize: 18, fontWeight: "900", letterSpacing: 2 },

  back: { alignSelf: "flex-start", paddingVertical: 8, paddingRight: 16 },
  backText: { fontSize: 16, fontWeight: "800", color: "#514B43" },

  emptyCard: { backgroundColor: "#fff", borderRadius: 22, padding: 20, borderWidth: 1, borderColor: "#E8E2D8", marginTop: 14 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#171717", marginBottom: 5 },
  historyCard: { backgroundColor: "#fff", borderRadius: 22, padding: 18, borderWidth: 1, borderColor: "#E8E2D8", marginTop: 12 },
  historyDate: { fontWeight: "900", fontSize: 13, color: "#6A645B", marginBottom: 14 },
  historyRow: { flexDirection: "row", gap: 16 },
  historyName: { fontWeight: "800", fontSize: 13, color: "#4F4942" },
  historyWord: { fontWeight: "900", fontSize: 22, letterSpacing: 1.5, color: "#171717", marginVertical: 3 }
});
