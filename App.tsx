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

const MAX_GUESSES = 6;

type TileState = "correct" | "present" | "absent";
type ScoredGuess = { word: string; states: TileState[] };
type RoomView = {
  code: string;
  playerId: "a" | "b";
  myName: string;
  partnerName: string | null;
  myWordReady: boolean;
  partnerWordReady: boolean;
  myResult: { guesses: ScoredGuess[]; solved: boolean; finished: boolean };
  partnerResult: { guessCount: number; solved: boolean; finished: boolean };
  completed: boolean;
  answer: string | null;
};
type Session = { code: string; token: string; serverUrl: string };
type Screen = "home" | "word" | "play";

function normalizeWord(value: string) {
  return value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 5);
}

function normalizeServerUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = async (quiet = false) => {
    if (!session) return;
    try {
      if (!quiet) setLoading(true);
      const next = await api<RoomView>(
        `${session.serverUrl}/rooms/${session.code}?token=${encodeURIComponent(session.token)}`
      );
      setRoom(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach room");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    refresh();
    const timer = setInterval(() => refresh(true), 1500);
    return () => clearInterval(timer);
  }, [session?.code, session?.token, session?.serverUrl]);

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <Lobby onConnected={(next) => setSession(next)} />
      </SafeAreaView>
    );
  }

  if (!room && loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!room) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.page}>
          <Text style={styles.hero}>Can't reach your room.</Text>
          <Text style={styles.sub}>{error || "Check that the local server is running."}</Text>
          <PrimaryButton title="Try again" onPress={() => refresh()} />
          <SecondaryButton title="Leave room" onPress={() => setSession(null)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      {screen === "home" && (
        <Home
          room={room}
          error={error}
          onSetWord={() => setScreen("word")}
          onPlay={() => setScreen("play")}
          onRefresh={() => refresh()}
          onLeave={() => {
            setSession(null);
            setRoom(null);
            setScreen("home");
          }}
        />
      )}
      {screen === "word" && (
        <SetWord
          room={room}
          session={session}
          onSaved={(next) => {
            setRoom(next);
            setScreen("home");
          }}
          onBack={() => setScreen("home")}
        />
      )}
      {screen === "play" && (
        <Play
          room={room}
          session={session}
          onRoom={setRoom}
          onBack={() => setScreen("home")}
        />
      )}
    </SafeAreaView>
  );
}

function Lobby({ onConnected }: { onConnected: (session: Session) => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [serverUrl, setServerUrl] = useState("http://localhost:8787");
  const [busy, setBusy] = useState(false);

  async function connect() {
    const base = normalizeServerUrl(serverUrl);
    if (!name.trim()) return Alert.alert("Add your name");
    if (!base) return Alert.alert("Add the local server URL");
    if (mode === "join" && code.trim().length !== 6) return Alert.alert("Enter the 6-character room code");

    try {
      setBusy(true);
      const result = mode === "create"
        ? await api<{ code: string; token: string }>(`${base}/rooms`, {
            method: "POST",
            body: JSON.stringify({ name: name.trim() })
          })
        : await api<{ code: string; token: string }>(`${base}/rooms/${code.trim().toUpperCase()}/join`, {
            method: "POST",
            body: JSON.stringify({ name: name.trim() })
          });
      onConnected({ code: result.code, token: result.token, serverUrl: base });
    } catch (e) {
      Alert.alert("Couldn't connect", e instanceof Error ? e.message : "Check the server URL");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.brandPill}><Text style={styles.brandPillText}>PAIRLE</Text></View>
      <Text style={styles.hero}>One word. Two screens. Every day.</Text>
      <Text style={styles.sub}>Create a room on one screen, join it on the other, then secretly make a five-letter word for each other.</Text>

      <View style={styles.segment}>
        <SegmentButton active={mode === "create"} title="Create room" onPress={() => setMode("create")} />
        <SegmentButton active={mode === "join"} title="Join room" onPress={() => setMode("join")} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>YOUR NAME</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Ayush" style={styles.input} autoCapitalize="words" />

        {mode === "join" && (
          <>
            <Text style={[styles.label, { marginTop: 18 }]}>ROOM CODE</Text>
            <TextInput
              value={code}
              onChangeText={(value) => setCode(value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              style={[styles.input, { letterSpacing: 4 }]}
              autoCapitalize="characters"
              maxLength={6}
            />
          </>
        )}

        <Text style={[styles.label, { marginTop: 18 }]}>LOCAL SERVER</Text>
        <TextInput
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://localhost:8787"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.helper}>For a physical phone, replace localhost with your Mac's local IP.</Text>
      </View>

      <PrimaryButton title={busy ? "Connecting…" : mode === "create" ? "Create Pairle" : "Join Pairle"} onPress={connect} disabled={busy} />
    </KeyboardAvoidingView>
  );
}

function Home({ room, error, onSetWord, onPlay, onRefresh, onLeave }: {
  room: RoomView;
  error: string;
  onSetWord: () => void;
  onPlay: () => void;
  onRefresh: () => void;
  onLeave: () => void;
}) {
  const canPlay = room.partnerWordReady && !room.myResult.finished;
  const waitingPartner = !room.partnerName;

  let title = "Your room is ready";
  let body = `Share code ${room.code} with your partner.`;
  if (!waitingPartner && !room.myWordReady) {
    title = `Make ${room.partnerName}'s word`;
    body = "Choose a secret five-letter word. Your partner never downloads the answer before solving.";
  } else if (!waitingPartner && room.myWordReady && !room.partnerWordReady) {
    title = `Waiting on ${room.partnerName}`;
    body = "Your word is locked. Their puzzle will appear here automatically.";
  } else if (canPlay) {
    title = `${room.partnerName}'s word is ready`;
    body = "You get six guesses. Good luck.";
  } else if (room.myResult.finished && !room.partnerResult.finished) {
    title = `You’re done — ${room.partnerName} is still playing`;
    body = room.myResult.solved ? `Solved in ${room.myResult.guesses.length}/6.` : `The word was ${room.answer}.`;
  } else if (room.completed) {
    title = "Today's Pairle is complete";
    body = `${room.myName}: ${resultText(room.myResult)} · ${room.partnerName}: ${room.partnerResult.solved ? `${room.partnerResult.guessCount}/6` : "missed"}`;
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.logo}>Pairle</Text>
          <Text style={styles.muted}>Room {room.code}</Text>
        </View>
        <View style={styles.onlinePill}><Text style={styles.onlineText}>● LIVE</Text></View>
      </View>

      <View style={styles.codeCard}>
        <Text style={styles.eyebrow}>PAIR CODE</Text>
        <Text style={styles.roomCode}>{room.code}</Text>
        <Text style={styles.muted}>{waitingPartner ? "Waiting for screen two to join" : `${room.myName} + ${room.partnerName}`}</Text>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>TODAY'S PAIRLE</Text>
        <Text style={styles.cardHero}>{title}</Text>
        <Text style={styles.sub}>{body}</Text>

        {!waitingPartner && !room.myWordReady && <PrimaryButton title="Choose secret word" onPress={onSetWord} />}
        {canPlay && <PrimaryButton title="Play partner's word" onPress={onPlay} />}
        {!canPlay && room.myWordReady && !room.completed && <SecondaryButton title="Refresh" onPress={onRefresh} />}
      </View>

      <View style={styles.twoCol}>
        <StatusCard title="Your word" value={room.myWordReady ? "Locked ✓" : "Not set"} />
        <StatusCard title="Their word" value={room.partnerWordReady ? "Ready ✓" : "Waiting"} />
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}
      <Pressable onPress={onLeave} style={styles.leaveButton}><Text style={styles.leaveText}>Leave room on this screen</Text></Pressable>
    </ScrollView>
  );
}

function SetWord({ room, session, onSaved, onBack }: {
  room: RoomView;
  session: Session;
  onSaved: (room: RoomView) => void;
  onBack: () => void;
}) {
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (word.length !== 5) return Alert.alert("Choose a five-letter word");
    try {
      setBusy(true);
      const next = await api<RoomView>(`${session.serverUrl}/rooms/${session.code}/word?token=${encodeURIComponent(session.token)}`, {
        method: "POST",
        body: JSON.stringify({ word })
      });
      onSaved(next);
    } catch (e) {
      Alert.alert("Couldn't save word", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Back onPress={onBack} />
      <Text style={styles.eyebrow}>SECRET WORD</Text>
      <Text style={styles.hero}>Pick a word for {room.partnerName}.</Text>
      <Text style={styles.sub}>Make it personal, funny, difficult, or tied to something from today.</Text>

      <View style={styles.wordEntry}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View style={[styles.bigTile, word[i] ? styles.bigTileFilled : null]} key={i}>
            <Text style={styles.bigTileText}>{word[i] || ""}</Text>
          </View>
        ))}
      </View>
      <TextInput
        value={word}
        onChangeText={(value) => setWord(normalizeWord(value))}
        autoFocus
        maxLength={5}
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.hiddenInput}
      />

      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>Actually secret 🤫</Text>
        <Text style={styles.tipText}>{room.partnerName} only receives guess results. The answer stays on the room server until their puzzle ends.</Text>
      </View>

      <PrimaryButton title={busy ? "Locking…" : "Lock it in"} onPress={save} disabled={busy || word.length !== 5} />
    </KeyboardAvoidingView>
  );
}

function Play({ room, session, onRoom, onBack }: {
  room: RoomView;
  session: Session;
  onRoom: (room: RoomView) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const result = room.myResult;

  async function submit() {
    if (draft.length !== 5) return Alert.alert("Enter five letters");
    try {
      setBusy(true);
      const next = await api<RoomView>(`${session.serverUrl}/rooms/${session.code}/guess?token=${encodeURIComponent(session.token)}`, {
        method: "POST",
        body: JSON.stringify({ guess: draft })
      });
      setDraft("");
      onRoom(next);
      if (next.myResult.finished) {
        Alert.alert(
          next.myResult.solved ? "Nice 🎉" : "Oof 😅",
          next.myResult.solved ? `Solved in ${next.myResult.guesses.length}/6.` : `The word was ${next.answer}.`
        );
      }
    } catch (e) {
      Alert.alert("Couldn't submit", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.headerRow}>
        <Back onPress={onBack} />
        <Text style={styles.muted}>{result.guesses.length}/{MAX_GUESSES}</Text>
      </View>
      <Text style={styles.eyebrow}>MADE BY {room.partnerName?.toUpperCase()}</Text>
      <Text style={styles.sectionTitle}>{room.myName}'s Pairle</Text>

      <View style={styles.board}>
        {Array.from({ length: MAX_GUESSES }).map((_, row) => {
          const submitted = result.guesses[row];
          const letters = submitted?.word || (row === result.guesses.length && !result.finished ? draft : "");
          return (
            <View style={styles.row} key={row}>
              {Array.from({ length: 5 }).map((__, col) => (
                <Tile key={col} letter={letters[col] || ""} state={submitted?.states[col]} />
              ))}
            </View>
          );
        })}
      </View>

      {!result.finished ? (
        <>
          <TextInput
            value={draft}
            onChangeText={(value) => setDraft(normalizeWord(value))}
            maxLength={5}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.guessInput}
            placeholder="TYPE YOUR GUESS"
          />
          <PrimaryButton title={busy ? "Checking…" : "Submit guess"} onPress={submit} disabled={busy || draft.length !== 5} />
        </>
      ) : (
        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>{result.solved ? "Solved 🎉" : `Answer: ${room.answer}`}</Text>
          <Text style={styles.tipText}>{result.solved ? `You got it in ${result.guesses.length} guesses.` : "Better luck tomorrow."}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Tile({ letter, state }: { letter: string; state?: TileState }) {
  return (
    <View style={[styles.tile, state === "correct" && styles.correct, state === "present" && styles.present, state === "absent" && styles.absent]}>
      <Text style={[styles.tileText, state && { color: "white" }]}>{letter}</Text>
    </View>
  );
}

function StatusCard({ title, value }: { title: string; value: string }) {
  return <View style={styles.playerCard}><Text style={styles.playerName}>{title}</Text><Text style={styles.playerStatus}>{value}</Text></View>;
}

function PrimaryButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, disabled && { opacity: 0.35 }, pressed && !disabled && { transform: [{ scale: 0.99 }] }]}>
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable style={styles.secondaryButton} onPress={onPress}><Text style={styles.secondaryButtonText}>{title}</Text></Pressable>;
}

function SegmentButton({ active, title, onPress }: { active: boolean; title: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentButtonActive]}><Text style={[styles.segmentText, active && styles.segmentTextActive]}>{title}</Text></Pressable>;
}

function Back({ onPress }: { onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>;
}

function resultText(result: RoomView["myResult"]) {
  return result.solved ? `${result.guesses.length}/6` : "missed";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7F4EE" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F4EE" },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 36, backgroundColor: "#F7F4EE" },
  brandPill: { alignSelf: "flex-start", backgroundColor: "#171717", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 22 },
  brandPillText: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  logo: { fontSize: 30, fontWeight: "900", letterSpacing: -1.3, color: "#171717" },
  hero: { fontSize: 38, lineHeight: 42, fontWeight: "900", letterSpacing: -1.5, color: "#171717", marginTop: 8 },
  sectionTitle: { fontSize: 30, fontWeight: "900", letterSpacing: -1, color: "#171717", marginBottom: 18 },
  sub: { fontSize: 16, lineHeight: 24, color: "#666158", marginTop: 12, marginBottom: 22 },
  muted: { fontSize: 13, color: "#827C72" },
  helper: { fontSize: 12, lineHeight: 18, color: "#8C857A", marginTop: 8 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.6, color: "#7A7469", marginTop: 12 },
  errorText: { color: "#A24D42", marginTop: 14, textAlign: "center" },
  card: { backgroundColor: "#fff", borderRadius: 24, padding: 18, marginVertical: 20, borderWidth: 1, borderColor: "#E8E2D8" },
  label: { fontSize: 11, fontWeight: "900", letterSpacing: 1.3, color: "#787167" },
  input: { marginTop: 8, fontSize: 18, fontWeight: "700", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#DED8CD", color: "#171717" },
  segment: { flexDirection: "row", backgroundColor: "#EAE5DB", padding: 4, borderRadius: 16, marginTop: 10 },
  segmentButton: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 13 },
  segmentButtonActive: { backgroundColor: "#fff" },
  segmentText: { fontWeight: "800", color: "#756F65" },
  segmentTextActive: { color: "#171717" },
  primaryButton: { backgroundColor: "#171717", minHeight: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 10 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  secondaryButton: { borderWidth: 1.5, borderColor: "#CCC4B7", minHeight: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 10 },
  secondaryButtonText: { fontSize: 15, fontWeight: "800", color: "#27231F" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  onlinePill: { backgroundColor: "#E3EFD1", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  onlineText: { fontSize: 11, fontWeight: "900", color: "#4E6D2C", letterSpacing: 1 },
  codeCard: { backgroundColor: "#fff", borderRadius: 24, padding: 20, marginTop: 26, borderWidth: 1, borderColor: "#E8E2D8" },
  roomCode: { fontSize: 38, fontWeight: "900", letterSpacing: 8, color: "#171717", marginVertical: 7 },
  heroCard: { marginTop: 14, borderRadius: 28, padding: 22, backgroundColor: "#E9F1C9", borderWidth: 1, borderColor: "#D8E4AB" },
  cardHero: { fontSize: 28, lineHeight: 32, fontWeight: "900", letterSpacing: -1, color: "#171717", marginTop: 8 },
  twoCol: { flexDirection: "row", gap: 12, marginTop: 14 },
  playerCard: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E8E2D8", padding: 16, borderRadius: 20 },
  playerName: { fontSize: 15, fontWeight: "900", color: "#171717" },
  playerStatus: { marginTop: 6, fontSize: 13, color: "#6C665D" },
  leaveButton: { paddingVertical: 22 },
  leaveText: { color: "#9A6F69", textAlign: "center", fontWeight: "700" },
  wordEntry: { flexDirection: "row", justifyContent: "space-between", marginTop: 28, marginBottom: 12 },
  bigTile: { width: "18%", aspectRatio: 0.85, borderRadius: 13, borderWidth: 2, borderColor: "#D8D1C5", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  bigTileFilled: { borderColor: "#171717" },
  bigTileText: { fontSize: 28, fontWeight: "900", color: "#171717" },
  hiddenInput: { opacity: 0.02, height: 4 },
  tipCard: { backgroundColor: "#FFF3D8", borderRadius: 20, padding: 17, marginTop: 24, marginBottom: 12, borderWidth: 1, borderColor: "#F2DFAE" },
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
  backText: { fontSize: 16, fontWeight: "800", color: "#514B43" }
});
