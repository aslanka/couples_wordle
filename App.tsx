import React, { useEffect, useState } from 'react';
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
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/supabase';
import { registerForPushNotifications, sendPairlePush } from './src/notifications';

type TileState = 'correct' | 'present' | 'absent';
type ScoredGuess = { word: string; states: TileState[] };
type Dashboard = {
  paired: boolean;
  pairId?: string;
  inviteCode?: string;
  streak?: number;
  partnerJoined?: boolean;
  partnerName?: string | null;
  myWordReady?: boolean;
  partnerWordReady?: boolean;
  completed?: boolean;
  myResult?: { guesses: ScoredGuess[]; solved: boolean; finished: boolean; answer: string | null };
  partnerResult?: { guessCount: number; solved: boolean; finished: boolean };
};
type Screen = 'home' | 'word' | 'play';

const COLORS = {
  background: '#FFF9F7',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF2EF',
  primary: '#D88C9A',
  primaryDark: '#A85F72',
  lavender: '#C9B8E8',
  peach: '#F4B8A6',
  text: '#2E2A2B',
  muted: '#8C7F82',
  border: '#EEDFE1',
  success: '#8FB996',
  yellow: '#D7B96C',
  tileGray: '#AAA1A3',
};

const normalizeWord = (v: string) => v.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5);

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    registerForPushNotifications().catch((error) => {
      console.warn('Push registration failed:', error instanceof Error ? error.message : error);
    });
  }, [session?.user.id]);

  if (booting) return <Centered><ActivityIndicator size="large" color={COLORS.primaryDark} /></Centered>;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      {session ? <PairleApp /> : <AuthScreen />}
    </SafeAreaView>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || password.length < 6) return Alert.alert('Add an email and a 6+ character password');
    try {
      setBusy(true);
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() || email.split('@')[0] } },
        });
        if (error) throw error;
        if (!data.session) Alert.alert('Check your email', 'Confirm your email, then come back and sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e) {
      Alert.alert('Could not continue', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.brandMark}>
        <View style={styles.brandDot}><Text style={styles.brandHeart}>♡</Text></View>
        <Text style={styles.logo}>Pairle</Text>
      </View>

      <View style={styles.authIntro}>
        <Text style={styles.hero}>A little word from your person, every day.</Text>
        <Text style={styles.sub}>Pair once, then make each other a five-letter puzzle whenever the day starts.</Text>
      </View>

      <View style={styles.segment}>
        <Segment active={mode === 'signup'} title="Create account" onPress={() => setMode('signup')} />
        <Segment active={mode === 'signin'} title="Sign in" onPress={() => setMode('signin')} />
      </View>

      <View style={styles.card}>
        {mode === 'signup' && <Input label="YOUR NAME" value={name} onChangeText={setName} placeholder="Your name" />}
        <Input label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@email.com" autoCapitalize="none" />
        <Input label="PASSWORD" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
      </View>
      <PrimaryButton title={busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'} onPress={submit} disabled={busy} />
    </KeyboardAvoidingView>
  );
}

function PairleApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');

  async function refresh(quiet = false) {
    try {
      if (!quiet) setLoading(true);
      const { data, error } = await supabase.rpc('get_pair_dashboard');
      if (error) throw error;
      setDashboard(data as Dashboard);
    } catch (e) {
      if (!quiet) Alert.alert('Could not load Pairle', e instanceof Error ? e.message : 'Try again');
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(() => refresh(true), 3000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !dashboard) return <Centered><ActivityIndicator size="large" color={COLORS.primaryDark} /></Centered>;
  if (!dashboard?.paired) return <PairSetup onDone={refresh} />;
  if (screen === 'word') return <SetWord dashboard={dashboard} onDone={(d) => { setDashboard(d); setScreen('home'); }} onBack={() => setScreen('home')} />;
  if (screen === 'play') return <Play dashboard={dashboard} onDone={setDashboard} onBack={() => setScreen('home')} />;
  return <Home dashboard={dashboard} onSetWord={() => setScreen('word')} onPlay={() => setScreen('play')} onRefresh={refresh} />;
}

function PairSetup({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    try {
      setBusy(true);
      if (mode === 'create') {
        const { data, error } = await supabase.rpc('create_pair');
        if (error) throw error;
        setCreatedCode(data.invite_code);
      } else {
        const { error } = await supabase.rpc('join_pair', { code: code.trim().toUpperCase() });
        if (error) throw error;
        onDone();
      }
    } catch (e) {
      Alert.alert('Pairing failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  if (createdCode) {
    return (
      <View style={[styles.page, styles.centerContent]}>
        <View style={styles.iconBubble}><Text style={styles.iconBubbleText}>♡</Text></View>
        <Text style={styles.eyebrow}>ONE-TIME INVITE</Text>
        <Text style={[styles.hero, styles.centerText]}>Send this code to your person.</Text>
        <View style={styles.inviteCard}><Text style={styles.inviteCode}>{createdCode}</Text></View>
        <Text style={[styles.sub, styles.centerText]}>Once they join, you two stay paired automatically.</Text>
        <PrimaryButton title="They joined — check" onPress={onDone} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.brandMark}>
        <View style={styles.brandDot}><Text style={styles.brandHeart}>♡</Text></View>
        <Text style={styles.logo}>Pairle</Text>
      </View>
      <Text style={styles.eyebrow}>PAIR ONCE</Text>
      <Text style={styles.hero}>Connect with your person.</Text>
      <Text style={styles.sub}>One of you creates the pair. The other enters the invite code once.</Text>
      <View style={styles.segment}>
        <Segment active={mode === 'create'} title="Create pair" onPress={() => setMode('create')} />
        <Segment active={mode === 'join'} title="Join partner" onPress={() => setMode('join')} />
      </View>
      {mode === 'join' && <View style={styles.card}><Input label="INVITE CODE" value={code} onChangeText={(v) => setCode(v.toUpperCase().slice(0, 6))} placeholder="ABC123" /></View>}
      <PrimaryButton title={busy ? 'Working…' : mode === 'create' ? 'Create our Pairle' : 'Join Pairle'} onPress={submit} disabled={busy} />
      <SecondaryButton title="Sign out" onPress={() => supabase.auth.signOut()} />
    </View>
  );
}

function Home({ dashboard, onSetWord, onPlay, onRefresh }: { dashboard: Dashboard; onSetWord: () => void; onPlay: () => void; onRefresh: () => void }) {
  const waitingForPartner = !dashboard.partnerJoined;
  const canPlay = !!dashboard.partnerWordReady && !dashboard.myResult?.finished;
  const partner = dashboard.partnerName || 'your person';

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View>
          <View style={styles.brandMarkCompact}>
            <Text style={styles.logo}>Pairle</Text>
            <Text style={styles.logoHeart}>♡</Text>
          </View>
          <Text style={styles.muted}>{prettyDate()}</Text>
        </View>
        <View style={styles.streakPill}>
          <Text style={styles.streakNumber}>{dashboard.streak ?? 0}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>
      </View>

      {waitingForPartner ? (
        <View style={styles.heroCard}>
          <View style={styles.heroCardTopRow}>
            <Text style={styles.eyebrow}>WAITING FOR YOUR PERSON</Text>
            <Text style={styles.softHeart}>♡</Text>
          </View>
          <Text style={styles.cardHero}>Almost there.</Text>
          <Text style={styles.subCompact}>Share your invite code and this becomes your permanent daily space together.</Text>
          <View style={styles.inviteInline}><Text style={styles.inviteInlineLabel}>INVITE CODE</Text><Text style={styles.inviteInlineCode}>{dashboard.inviteCode}</Text></View>
          <SecondaryButton title="Refresh" onPress={onRefresh} />
        </View>
      ) : (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroCardTopRow}>
              <Text style={styles.eyebrow}>TODAY'S PAIRLE</Text>
              <Text style={styles.softHeart}>{dashboard.completed ? '♥' : '♡'}</Text>
            </View>
            <Text style={styles.cardHero}>{dashboard.completed ? 'You both finished.' : `You + ${partner}`}</Text>
            <Text style={styles.subCompact}>{dashboard.completed ? 'That is today’s little ritual done. Come back tomorrow for a fresh word.' : 'Pick a word for each other, then solve whenever you’re ready.'}</Text>
            <View style={styles.progressRail}>
              <View style={[styles.progressDot, dashboard.myWordReady && styles.progressDotDone]} />
              <View style={styles.progressLine} />
              <View style={[styles.progressDot, dashboard.partnerWordReady && styles.progressDotDone]} />
              <View style={styles.progressLine} />
              <View style={[styles.progressDot, dashboard.completed && styles.progressDotDone]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>Yours sent</Text>
              <Text style={styles.progressLabel}>Theirs ready</Text>
              <Text style={styles.progressLabel}>Both done</Text>
            </View>
          </View>

          <ActionCard
            accent="rose"
            title={`For ${partner}`}
            status={dashboard.myWordReady ? 'Word locked in' : 'Choose their word'}
            detail={dashboard.myWordReady ? 'They’ll get it when they’re ready.' : 'Pick something clever, sweet, or evil.'}
            icon={dashboard.myWordReady ? '✓' : '→'}
            button={!dashboard.myWordReady ? 'Create word' : undefined}
            onPress={onSetWord}
          />

          <ActionCard
            accent="lavender"
            title={`From ${partner}`}
            status={dashboard.partnerWordReady ? dashboard.myResult?.finished ? resultText(dashboard.myResult) : 'Your word is ready' : `Waiting on ${partner}`}
            detail={dashboard.partnerWordReady ? dashboard.myResult?.finished ? 'See you tomorrow for the next one.' : 'They picked something just for you.' : 'We’ll let you know when it lands.'}
            icon={dashboard.partnerWordReady ? '♡' : '…'}
            button={canPlay ? 'Play their word' : undefined}
            onPress={onPlay}
          />
        </>
      )}

      <Pressable style={styles.refreshLink} onPress={onRefresh}><Text style={styles.refreshLinkText}>Refresh</Text></Pressable>
      <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}><Text style={styles.signOutText}>Sign out</Text></Pressable>
    </ScrollView>
  );
}

function SetWord({ dashboard, onDone, onBack }: { dashboard: Dashboard; onDone: (d: Dashboard) => void; onBack: () => void }) {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (word.length !== 5) return;
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('submit_word', { word });
      if (error) throw error;
      onDone(data as Dashboard);
      sendPairlePush('word_sent').catch(() => undefined);
      Alert.alert('Sent ♡', `${dashboard.partnerName} can now play today's word.`);
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Back onPress={onBack} />
      <View style={styles.screenIntro}>
        <Text style={styles.eyebrow}>SECRET WORD</Text>
        <Text style={styles.hero}>Pick one for {dashboard.partnerName}.</Text>
        <Text style={styles.sub}>Five letters. Make it sweet, sneaky, or something only they would get.</Text>
      </View>
      <View style={styles.wordPanel}>
        <WordTiles word={word} />
        <Text style={styles.helper}>Tap the boxes, then type your word.</Text>
        <TextInput value={word} onChangeText={(v) => setWord(normalizeWord(v))} autoFocus maxLength={5} autoCapitalize="characters" autoCorrect={false} style={styles.hiddenInput} />
      </View>
      <PrimaryButton title={busy ? 'Sending…' : 'Lock in today’s word'} onPress={save} disabled={busy || word.length !== 5} />
    </KeyboardAvoidingView>
  );
}

function Play({ dashboard, onDone, onBack }: { dashboard: Dashboard; onDone: (d: Dashboard) => void; onBack: () => void }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const guesses = dashboard.myResult?.guesses ?? [];

  async function submit() {
    if (draft.length !== 5) return;
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('submit_guess', { attempt: draft });
      if (error) throw error;
      setDraft('');
      const next = data as Dashboard;
      onDone(next);
      if (next.myResult?.finished) {
        sendPairlePush(next.completed ? 'day_completed' : 'puzzle_finished', {
          solved: next.myResult.solved,
          guessCount: next.myResult.guesses.length,
        }).catch(() => undefined);
        Alert.alert(next.myResult.solved ? 'You got it ♡' : 'So close', next.myResult.solved ? `Solved in ${next.myResult.guesses.length}/6.` : `The word was ${next.myResult.answer}.`);
      }
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Back onPress={onBack} />
      <View style={styles.playHeader}>
        <View>
          <Text style={styles.eyebrow}>FROM {dashboard.partnerName?.toUpperCase()}</Text>
          <Text style={styles.sectionTitle}>Today’s word</Text>
        </View>
        <View style={styles.guessCounter}><Text style={styles.guessCounterText}>{Math.min(guesses.length + 1, 6)} / 6</Text></View>
      </View>
      <View style={styles.boardCard}>
        <View style={styles.board}>{Array.from({ length: 6 }).map((_, r) => <GuessRow key={r} guess={guesses[r]} draft={r === guesses.length ? draft : ''} />)}</View>
      </View>
      {!dashboard.myResult?.finished && (
        <>
          <TextInput value={draft} onChangeText={(v) => setDraft(normalizeWord(v))} maxLength={5} autoCapitalize="characters" autoCorrect={false} style={styles.guessInput} placeholder="TYPE YOUR GUESS" placeholderTextColor={COLORS.muted} />
          <PrimaryButton title={busy ? 'Checking…' : 'Submit guess'} onPress={submit} disabled={busy || draft.length !== 5} />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function GuessRow({ guess, draft }: { guess?: ScoredGuess; draft: string }) {
  const word = guess?.word ?? draft;
  return (
    <View style={styles.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={[styles.tile, guess?.states[i] === 'correct' && styles.correct, guess?.states[i] === 'present' && styles.present, guess?.states[i] === 'absent' && styles.absent]}>
          <Text style={[styles.tileText, guess && styles.tileTextScored]}>{word[i] ?? ''}</Text>
        </View>
      ))}
    </View>
  );
}

function WordTiles({ word }: { word: string }) {
  return (
    <View style={styles.wordEntry}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={[styles.bigTile, word[i] && styles.bigTileFilled]}>
          <Text style={styles.bigTileText}>{word[i] ?? ''}</Text>
        </View>
      ))}
    </View>
  );
}

function ActionCard({ title, status, detail, button, onPress, icon, accent }: { title: string; status: string; detail: string; button?: string; onPress: () => void; icon: string; accent: 'rose' | 'lavender' }) {
  return (
    <View style={[styles.actionCard, accent === 'lavender' && styles.actionCardLavender]}>
      <View style={styles.actionTopRow}>
        <Text style={styles.actionTitle}>{title}</Text>
        <View style={[styles.actionIcon, accent === 'lavender' && styles.actionIconLavender]}><Text style={styles.actionIconText}>{icon}</Text></View>
      </View>
      <Text style={styles.actionStatus}>{status}</Text>
      <Text style={styles.actionDetail}>{detail}</Text>
      {button && <PrimaryButton title={button} onPress={onPress} compact />}
    </View>
  );
}

function Input(props: any) {
  const { label, ...rest } = props;
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...rest} placeholderTextColor={COLORS.muted} style={styles.input} />
    </View>
  );
}

function Segment({ active, title, onPress }: { active: boolean; title: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentActive]}><Text style={[styles.segmentText, active && styles.segmentTextActive]}>{title}</Text></Pressable>;
}

function PrimaryButton({ title, onPress, disabled = false, compact = false }: { title: string; onPress: () => void; disabled?: boolean; compact?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.primaryButton, compact && styles.primaryButtonCompact, disabled && styles.disabled]}><Text style={styles.primaryButtonText}>{title}</Text></Pressable>;
}

function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{title}</Text></Pressable>;
}

function Back({ onPress }: { onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.center}>{children}</SafeAreaView>;
}

function resultText(r?: Dashboard['myResult']) {
  if (!r) return 'Waiting';
  return r.solved ? `Solved in ${r.guesses.length}/6` : r.finished ? `Missed · ${r.answer}` : 'Ready';
}

function prettyDate() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 34, backgroundColor: COLORS.background },
  centerContent: { justifyContent: 'center' },
  centerText: { textAlign: 'center' },

  brandMark: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  brandMarkCompact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  brandHeart: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: -1 },
  logo: { fontSize: 31, color: COLORS.text, fontWeight: '900', letterSpacing: -1.4 },
  logoHeart: { color: COLORS.primaryDark, fontSize: 20, fontWeight: '800', marginTop: 2 },

  authIntro: { marginBottom: 6 },
  hero: { fontSize: 37, lineHeight: 42, fontWeight: '900', letterSpacing: -1.45, color: COLORS.text, marginTop: 8 },
  sectionTitle: { fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -1, color: COLORS.text, marginTop: 4 },
  sub: { fontSize: 16, lineHeight: 24, color: COLORS.muted, marginTop: 12, marginBottom: 22 },
  subCompact: { fontSize: 15, lineHeight: 22, color: '#735E64', marginTop: 10 },
  muted: { fontSize: 13, color: COLORS.muted, marginTop: 3 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.35, color: COLORS.primaryDark },

  segment: { flexDirection: 'row', backgroundColor: '#F3E6E8', padding: 4, borderRadius: 18, marginTop: 20, marginBottom: 2 },
  segmentButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14 },
  segmentActive: { backgroundColor: COLORS.surface, shadowColor: '#6E4A52', shadowOpacity: 0.08, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  segmentText: { fontWeight: '800', color: COLORS.muted },
  segmentTextActive: { color: COLORS.text },

  card: { backgroundColor: COLORS.surface, borderRadius: 26, padding: 20, marginVertical: 18, borderWidth: 1, borderColor: COLORS.border, shadowColor: '#6B4E54', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 1 },
  inputWrap: { marginBottom: 16 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3, color: COLORS.primaryDark },
  input: { marginTop: 7, fontSize: 17, color: COLORS.text, fontWeight: '700', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },

  primaryButton: { backgroundColor: COLORS.primaryDark, minHeight: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 18, shadowColor: '#7B3D4E', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  primaryButtonCompact: { minHeight: 52, marginTop: 18 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.34 },
  secondaryButton: { minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 14, backgroundColor: 'rgba(255,255,255,.62)', borderWidth: 1.5, borderColor: '#DFC8CD' },
  secondaryButtonText: { color: COLORS.primaryDark, fontSize: 15, fontWeight: '900' },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 16, marginBottom: 8 },
  backText: { color: COLORS.primaryDark, fontWeight: '900', fontSize: 16 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  streakPill: { minWidth: 82, backgroundColor: COLORS.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  streakNumber: { color: COLORS.primaryDark, fontWeight: '900', fontSize: 18, lineHeight: 20 },
  streakLabel: { color: COLORS.muted, fontWeight: '700', fontSize: 10, marginTop: 2 },

  heroCard: { marginTop: 24, borderRadius: 30, padding: 22, backgroundColor: '#FBE7E7', borderWidth: 1, borderColor: '#F2CED2', shadowColor: '#8D5B65', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 1 },
  heroCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  softHeart: { color: COLORS.primaryDark, fontSize: 26, fontWeight: '800' },
  cardHero: { fontSize: 29, lineHeight: 34, color: COLORS.text, fontWeight: '900', letterSpacing: -1, marginTop: 8 },
  progressRail: { flexDirection: 'row', alignItems: 'center', marginTop: 24, paddingHorizontal: 5 },
  progressDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#E3C9CD', borderWidth: 2, borderColor: '#D6B3BA' },
  progressDotDone: { backgroundColor: COLORS.primaryDark, borderColor: COLORS.primaryDark },
  progressLine: { flex: 1, height: 2, backgroundColor: '#DDBFC5' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  progressLabel: { color: '#8B7378', fontWeight: '700', fontSize: 10 },
  inviteInline: { marginTop: 20, backgroundColor: 'rgba(255,255,255,.55)', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteInlineLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  inviteInlineCode: { color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: 3 },

  actionCard: { backgroundColor: COLORS.surfaceAlt, borderRadius: 26, padding: 20, marginTop: 14, borderWidth: 1, borderColor: '#F1D8DB' },
  actionCardLavender: { backgroundColor: '#F3EFFB', borderColor: '#E0D6F2' },
  actionTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionTitle: { color: COLORS.primaryDark, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  actionIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3CFD4', alignItems: 'center', justifyContent: 'center' },
  actionIconLavender: { backgroundColor: '#DED3F0' },
  actionIconText: { color: COLORS.text, fontSize: 17, fontWeight: '900' },
  actionStatus: { color: COLORS.text, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.6, marginTop: 10 },
  actionDetail: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },

  iconBubble: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3D8DD', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  iconBubbleText: { color: COLORS.primaryDark, fontSize: 36, fontWeight: '800' },
  inviteCard: { alignSelf: 'stretch', backgroundColor: COLORS.surface, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, marginVertical: 24, paddingVertical: 22 },
  inviteCode: { color: COLORS.text, fontSize: 42, fontWeight: '900', letterSpacing: 8, textAlign: 'center' },

  refreshLink: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 14, marginTop: 8 },
  refreshLinkText: { color: COLORS.primaryDark, fontWeight: '800', fontSize: 14 },
  signOut: { padding: 10 },
  signOutText: { textAlign: 'center', color: '#B59AA0', fontWeight: '700', fontSize: 13 },

  screenIntro: { marginBottom: 6 },
  wordPanel: { backgroundColor: COLORS.surface, borderRadius: 28, padding: 18, marginTop: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  wordEntry: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 12 },
  bigTile: { width: '18%', aspectRatio: 0.88, borderRadius: 15, borderWidth: 2, borderColor: '#E3D2D5', backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  bigTileFilled: { borderColor: COLORS.primaryDark, backgroundColor: '#FBEAEC' },
  bigTileText: { color: COLORS.text, fontSize: 28, fontWeight: '900' },
  helper: { color: COLORS.muted, fontSize: 12, textAlign: 'center', marginTop: 7, marginBottom: 2 },
  hiddenInput: { opacity: 0.02, height: 5 },

  playHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  guessCounter: { backgroundColor: '#F0E7F8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  guessCounterText: { color: '#75628E', fontWeight: '900', fontSize: 12 },
  boardCard: { backgroundColor: COLORS.surface, borderRadius: 28, paddingVertical: 18, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 },
  board: { gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  tile: { width: 52, height: 52, borderWidth: 2, borderColor: '#E3D7D9', borderRadius: 11, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  tileText: { color: COLORS.text, fontSize: 23, fontWeight: '900' },
  tileTextScored: { color: '#fff' },
  correct: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  present: { backgroundColor: COLORS.yellow, borderColor: COLORS.yellow },
  absent: { backgroundColor: COLORS.tileGray, borderColor: COLORS.tileGray },
  guessInput: { minHeight: 56, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: '#E1CED2', paddingHorizontal: 16, textAlign: 'center', color: COLORS.text, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
});