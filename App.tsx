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
type BoardSnapshot = { guesses: ScoredGuess[]; solved: boolean; finished: boolean; answer: string | null } | null;
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
  myResult?: NonNullable<BoardSnapshot>;
  partnerResult?: { guessCount: number; solved: boolean; finished: boolean };
};
type PairStats = {
  paired: boolean;
  myName?: string | null;
  partnerName?: string | null;
  myAverage?: number | null;
  partnerAverage?: number | null;
  myWins?: number;
  partnerWins?: number;
  ties?: number;
  completedGames?: number;
};
type HistoryRound = {
  gameId: string;
  gameDate: string;
  displayAt: string;
  completed: boolean;
  myBoard: BoardSnapshot;
  partnerBoard: BoardSnapshot;
};
type MainTab = 'home' | 'wordle' | 'history' | 'account';
type Screen = MainTab | 'setWord';
type AuthMode = 'signup' | 'signin';
type HistorySide = 'mine' | 'theirs';
type KeyStatus = TileState | undefined;

const normalizeWord = (v: string) => v.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5);
const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

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
    registerForPushNotifications().catch((error) => console.warn('Push registration failed:', error));
  }, [session?.user.id]);

  if (booting) return <Centered><ActivityIndicator size="large" /></Centered>;
  if (showOnboarding) {
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><OnboardingScreen onDone={() => { setShowOnboarding(false); if (!session) setAuthMode('signin'); }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      {session ? <PairleApp /> : <AuthScreen initialMode={authMode} onModeChange={setAuthMode} onSignupComplete={() => setShowOnboarding(true)} />}
    </SafeAreaView>
  );
}

function AuthScreen({ initialMode, onModeChange, onSignupComplete }: { initialMode: AuthMode; onModeChange: (mode: AuthMode) => void; onSignupComplete: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setMode(initialMode), [initialMode]);

  function switchMode(next: AuthMode) { setMode(next); onModeChange(next); }
  async function submit() {
    if (!email.trim() || password.length < 6) return Alert.alert('Almost there', 'Add an email and a password with at least 6 characters.');
    try {
      setBusy(true);
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() || email.split('@')[0] } } });
        if (error) throw error;
        onSignupComplete();
        if (!data.session) onModeChange('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e) { Alert.alert('Could not continue', e instanceof Error ? e.message : 'Try again'); }
    finally { setBusy(false); }
  }
  function socialPreview(provider: string) { Alert.alert(`${provider} sign in`, 'This will be wired up before launch. For now, use email so we can keep testing the flow.'); }

  return (
    <KeyboardAvoidingView style={styles.authPage} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.authLogo}>Pairle <Text style={styles.logoHeart}>♡</Text></Text>
        <Text style={styles.authHero}>{mode === 'signup' ? 'A tiny daily thing, just for you two.' : 'Welcome back.'}</Text>
        <Text style={styles.authSub}>{mode === 'signup' ? 'Make an account, pair once, then trade one five-letter word every day.' : 'Your person and today’s word are right where you left them.'}</Text>
        <View style={styles.authCard}>
          {mode === 'signup' && <Input label="YOUR NAME" value={name} onChangeText={setName} placeholder="Your name" />}
          <Input label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@email.com" autoCapitalize="none" keyboardType="email-address" />
          <Input label="PASSWORD" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
          <PrimaryButton title={busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'} onPress={submit} disabled={busy} />
        </View>
        <Text style={styles.orText}>or</Text>
        <SocialButton title="Continue with Google" mark="G" onPress={() => socialPreview('Google')} />
        <SocialButton title="Continue with Apple" mark="●" onPress={() => socialPreview('Apple')} />
        <View style={styles.authFooterRow}>
          <Text style={styles.authFooterText}>{mode === 'signup' ? 'Already have an account?' : 'New to Pairle?'}</Text>
          <Pressable onPress={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}><Text style={styles.authFooterLink}>{mode === 'signup' ? ' Sign in' : ' Create account'}</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const slides = [
    { kicker: 'PAIR ONCE', big: 'Pick your person.', body: 'One of you creates a private Pairle. The other joins with a one-time code.', art: '♡' },
    { kicker: 'MAKE IT THEIRS', big: 'Choose one word.', body: 'You each secretly pick a five-letter word for the other person to solve.', art: 'WORD' },
    { kicker: 'SEE WHO GETS IT', big: 'Six tries. No peeking.', body: 'Solve their word, compare your guess averages, and come back tomorrow for a fresh Pairle.', art: '6' },
  ];
  const slide = slides[step];
  const last = step === slides.length - 1;
  return (
    <View style={styles.onboardingPage}>
      <View style={styles.onboardingTopRow}><Text style={styles.authLogo}>Pairle <Text style={styles.logoHeart}>♡</Text></Text><Text style={styles.stepCount}>{step + 1}/{slides.length}</Text></View>
      <View style={styles.onboardingArt}><Text style={[styles.onboardingArtText, slide.art === 'WORD' && styles.onboardingWordArt]}>{slide.art}</Text></View>
      <Text style={styles.eyebrow}>{slide.kicker}</Text><Text style={styles.onboardingHero}>{slide.big}</Text><Text style={styles.onboardingBody}>{slide.body}</Text>
      <View style={styles.onboardingBottom}><View style={styles.dotsRow}>{slides.map((_, i) => <View key={i} style={[styles.onboardingDot, i === step && styles.onboardingDotActive]} />)}</View><Pressable style={styles.nextCircle} onPress={() => last ? onDone() : setStep((s) => s + 1)}><Text style={styles.nextArrow}>{last ? '✓' : '→'}</Text></Pressable></View>
    </View>
  );
}

function PairleApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [stats, setStats] = useState<PairStats | null>(null);
  const [history, setHistory] = useState<HistoryRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');

  async function refresh(quiet = false) {
    try {
      if (!quiet) setLoading(true);
      const [dashResult, statsResult, historyResult] = await Promise.all([
        supabase.rpc('get_pair_dashboard'),
        supabase.rpc('get_pair_stats'),
        supabase.rpc('get_pair_history'),
      ]);
      if (dashResult.error) throw dashResult.error;
      if (statsResult.error) throw statsResult.error;
      if (historyResult.error) throw historyResult.error;
      setDashboard(dashResult.data as Dashboard);
      setStats(statsResult.data as PairStats);
      setHistory((historyResult.data ?? []) as HistoryRound[]);
    } catch (e) { if (!quiet) Alert.alert('Could not load Pairle', e instanceof Error ? e.message : 'Try again'); }
    finally { if (!quiet) setLoading(false); }
  }

  useEffect(() => { refresh(); const timer = setInterval(() => refresh(true), 3000); return () => clearInterval(timer); }, []);
  if (loading && !dashboard) return <Centered><ActivityIndicator size="large" /></Centered>;
  if (!dashboard?.paired) return <PairSetup onDone={refresh} />;
  if (screen === 'setWord') return <SetWord dashboard={dashboard} onDone={(d) => { setDashboard(d); refresh(true); setScreen('home'); }} onBack={() => setScreen('home')} />;
  const tab = screen as MainTab;
  return (
    <View style={styles.appShell}>
      <View style={styles.screenArea}>
        {tab === 'home' && <Home dashboard={dashboard} stats={stats} onSetWord={() => setScreen('setWord')} onRefresh={refresh} />}
        {tab === 'wordle' && <WordleScreen dashboard={dashboard} onDone={(d) => { setDashboard(d); refresh(true); }} />}
        {tab === 'history' && <HistoryScreen rounds={history} dashboard={dashboard} stats={stats} />}
        {tab === 'account' && <AccountScreen dashboard={dashboard} stats={stats} />}
      </View>
      <BottomNav active={tab} onChange={setScreen} />
    </View>
  );
}

function PairSetup({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    try {
      setBusy(true);
      if (mode === 'create') { const { data, error } = await supabase.rpc('create_pair'); if (error) throw error; setCreatedCode(data.invite_code); }
      else { const { error } = await supabase.rpc('join_pair', { code: code.trim().toUpperCase() }); if (error) throw error; onDone(); }
    } catch (e) { Alert.alert('Pairing failed', e instanceof Error ? e.message : 'Try again'); }
    finally { setBusy(false); }
  }
  if (createdCode) return <View style={[styles.page, styles.centerContent]}><CountdownBar /><Text style={styles.eyebrow}>ONE-TIME INVITE</Text><Text style={[styles.hero, { textAlign: 'center' }]}>Send this code to your partner</Text><Text style={styles.inviteCode}>{createdCode}</Text><Text style={[styles.sub, { textAlign: 'center' }]}>You will never need this code again after they join.</Text><PrimaryButton title="They joined — check" onPress={onDone} /></View>;
  return <View style={styles.page}><CountdownBar /><Text style={styles.eyebrow}>PAIR ONCE</Text><Text style={styles.hero}>Connect with your person.</Text><Text style={styles.sub}>One of you creates the pair. The other enters the invite code once.</Text><View style={styles.segment}><Segment active={mode === 'create'} title="Create pair" onPress={() => setMode('create')} /><Segment active={mode === 'join'} title="Join partner" onPress={() => setMode('join')} /></View>{mode === 'join' && <View style={styles.card}><Input label="INVITE CODE" value={code} onChangeText={(v: string) => setCode(v.toUpperCase().slice(0, 6))} placeholder="ABC123" /></View>}<PrimaryButton title={busy ? 'Working…' : mode === 'create' ? 'Create our Pairle' : 'Join Pairle'} onPress={submit} disabled={busy} /><SecondaryButton title="Sign out" onPress={() => supabase.auth.signOut()} /></View>;
}

function Home({ dashboard, stats, onSetWord, onRefresh }: { dashboard: Dashboard; stats: PairStats | null; onSetWord: () => void; onRefresh: () => void }) {
  const waiting = !dashboard.partnerJoined;
  return (
    <ScrollView contentContainerStyle={styles.pageWithNav}>
      <View style={styles.headerRow}><View><Text style={styles.logo}>Pairle <Text style={styles.logoHeart}>♡</Text></Text><Text style={styles.muted}>{prettyDate()}</Text></View><View style={styles.streakCard}><Text style={styles.streakNumber}>{dashboard.streak ?? 0}</Text><Text style={styles.streakLabel}>day streak</Text></View></View>
      <CountdownBar />
      {waiting ? <View style={styles.heroCard}><Text style={styles.eyebrow}>WAITING FOR YOUR PARTNER</Text><Text style={styles.cardHero}>Invite code: {dashboard.inviteCode}</Text><Text style={styles.subCompact}>Once they join, this becomes your shared Pairle.</Text><SecondaryButton title="Refresh" onPress={onRefresh} /></View> : <>
        <View style={styles.heroCard}><Text style={styles.eyebrow}>TODAY'S PAIRLE</Text><Text style={styles.cardHero}>{dashboard.completed ? 'You both finished.' : `You + ${dashboard.partnerName}`}</Text><Text style={styles.subCompact}>{dashboard.completed ? 'Today’s Pairle is done. A fresh one opens at midnight.' : 'A tiny challenge, made for each other.'}</Text><ProgressLine dashboard={dashboard} /></View>
        <View style={styles.statsCard}><View style={styles.statsHeaderRow}><View><Text style={styles.eyebrow}>GUESS RACE</Text><Text style={styles.statsTitle}>Who gets there faster?</Text></View><Text style={styles.statsMini}>{stats?.completedGames ?? 0} days</Text></View><View style={styles.statCompareRow}><StatPerson name={stats?.myName || 'You'} average={stats?.myAverage} wins={stats?.myWins ?? 0} /><View style={styles.vsPill}><Text style={styles.vsText}>vs</Text></View><StatPerson name={stats?.partnerName || dashboard.partnerName || 'Partner'} average={stats?.partnerAverage} wins={stats?.partnerWins ?? 0} /></View><Text style={styles.statsFoot}>Average guesses on solved words · {stats?.ties ?? 0} ties</Text></View>
        <ActionCard title={`For ${dashboard.partnerName}`} status={dashboard.myWordReady ? 'Word locked in' : 'Pick today’s word'} detail={dashboard.myWordReady ? 'They’ll get it whenever they’re ready.' : 'Choose a five-letter word just for them.'} button={!dashboard.myWordReady ? 'Create word' : undefined} onPress={onSetWord} />
        <View style={[styles.actionCard, styles.lavenderCard]}><Text style={styles.eyebrow}>FROM {dashboard.partnerName?.toUpperCase()}</Text><Text style={styles.actionStatus}>{dashboard.partnerWordReady ? dashboard.myResult?.finished ? resultText(dashboard.myResult) : 'Ready for you' : `Waiting on ${dashboard.partnerName}…`}</Text><Text style={styles.actionDetail}>{dashboard.myResult?.finished ? 'Your board stays saved in the Wordle tab for the rest of today.' : dashboard.partnerWordReady ? 'Open Wordle whenever you want to play.' : 'You’ll get a notification when their word is ready.'}</Text></View>
      </>}
      <Pressable style={styles.refreshLink} onPress={onRefresh}><Text style={styles.refreshText}>Refresh</Text></Pressable>
    </ScrollView>
  );
}

function WordleScreen({ dashboard, onDone }: { dashboard: Dashboard; onDone: (d: Dashboard) => void }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const guesses = dashboard.myResult?.guesses ?? [];

  async function submit() {
    if (draft.length !== 5 || busy) return;
    try {
      setBusy(true);
      const validEnglishWord = await isValidEnglishGuess(draft);
      if (!validEnglishWord) {
        Alert.alert('Not in the word list', 'Try a valid five-letter English word.');
        return;
      }
      const { data, error } = await supabase.rpc('submit_guess', { attempt: draft });
      if (error) throw error;
      setDraft('');
      const next = data as Dashboard;
      onDone(next);
      if (next.myResult?.finished) {
        sendPairlePush(next.completed ? 'day_completed' : 'puzzle_finished', { solved: next.myResult.solved, guessCount: next.myResult.guesses.length }).catch(() => undefined);
        Alert.alert(next.myResult.solved ? 'Nice ♡' : 'That one was sneaky', next.myResult.solved ? `Solved in ${next.myResult.guesses.length}/6.` : `The word was ${next.myResult.answer}.`);
      }
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pageWithNav} keyboardShouldPersistTaps="always">
      <View style={styles.simpleHeader}><Text style={styles.sectionTitle}>Wordle</Text><Text style={styles.muted}>From {dashboard.partnerName}</Text></View>
      <CountdownBar />
      {!dashboard.partnerWordReady ? (
        <View style={styles.waitingCard}><Text style={styles.eyebrow}>NOT READY YET</Text><Text style={styles.cardHero}>Waiting on {dashboard.partnerName}.</Text><Text style={styles.subCompact}>We’ll keep this spot ready. You’ll get a notification when their word lands.</Text></View>
      ) : (
        <>
          <View style={styles.wordleTopCard}><Text style={styles.eyebrow}>TODAY'S WORD</Text><Text style={styles.wordleStatus}>{dashboard.myResult?.finished ? resultText(dashboard.myResult) : `${guesses.length}/6 guesses used`}</Text>{dashboard.myResult?.finished && <Text style={styles.wordleSub}>This board stays here until midnight.</Text>}</View>
          <Board guesses={guesses} draft={!dashboard.myResult?.finished ? draft : ''} />
          {!dashboard.myResult?.finished ? (
            <PairleKeyboard
              guesses={guesses}
              draft={draft}
              onChange={setDraft}
              onSubmit={submit}
              busy={busy}
            />
          ) : (
            <View style={styles.finishedNote}><Text style={styles.finishedNoteText}>{dashboard.myResult.solved ? `Solved in ${guesses.length}. Nicely done.` : `Answer: ${dashboard.myResult.answer}`}</Text></View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function HistoryScreen({ rounds, dashboard, stats }: { rounds: HistoryRound[]; dashboard: Dashboard; stats: PairStats | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [side, setSide] = useState<HistorySide>('mine');
  useEffect(() => { if (!rounds.length) setSelectedId(null); else if (!selectedId || !rounds.some((r) => r.gameId === selectedId)) setSelectedId(rounds[0].gameId); }, [rounds, selectedId]);
  if (!rounds.length) return <ScrollView contentContainerStyle={styles.pageWithNav}><View style={styles.simpleHeader}><Text style={styles.sectionTitle}>History</Text><Text style={styles.muted}>Your old boards will live here.</Text></View><CountdownBar /><View style={styles.waitingCard}><Text style={styles.eyebrow}>NOTHING HERE YET</Text><Text style={styles.cardHero}>Finish a Pairle first.</Text><Text style={styles.subCompact}>Once you have a day to look back on, it’ll show up here automatically.</Text></View></ScrollView>;
  const rawIndex = rounds.findIndex((r) => r.gameId === selectedId);
  const selectedIndex = rawIndex < 0 ? 0 : rawIndex;
  const selected = rounds[selectedIndex];
  const board = side === 'mine' ? selected.myBoard : selected.partnerBoard;
  const canNewer = selectedIndex > 0;
  const canOlder = selectedIndex < rounds.length - 1;
  return (
    <ScrollView contentContainerStyle={styles.pageWithNav}>
      <View style={styles.simpleHeader}><Text style={styles.sectionTitle}>History</Text><Text style={styles.muted}>Every Pairle, still exactly how you left it.</Text></View><CountdownBar />
      <View style={styles.historyDateRow}>
        <Pressable disabled={!canOlder} style={[styles.historyArrow, !canOlder && styles.historyArrowDisabled]} onPress={() => setSelectedId(rounds[selectedIndex + 1].gameId)}><Text style={styles.historyArrowText}>‹</Text></Pressable>
        <Pressable style={styles.historyDateCenter} onPress={() => setPickerOpen((v) => !v)}><Text style={styles.historyDate}>{formatRoundDate(selected)}</Text><Text style={styles.historyTime}>tap to pick a date</Text></Pressable>
        <Pressable disabled={!canNewer} style={[styles.historyArrow, !canNewer && styles.historyArrowDisabled]} onPress={() => setSelectedId(rounds[selectedIndex - 1].gameId)}><Text style={styles.historyArrowText}>›</Text></Pressable>
      </View>
      {pickerOpen && <View style={styles.historyPicker}><Text style={styles.eyebrow}>PICK A DATE</Text>{rounds.slice(0, 20).map((round) => <Pressable key={round.gameId} onPress={() => { setSelectedId(round.gameId); setPickerOpen(false); }} style={[styles.historyPickerRow, round.gameId === selected.gameId && styles.historyPickerRowActive]}><View><Text style={styles.historyPickerDate}>{formatRoundDate(round)}</Text><Text style={styles.historyPickerTime}>Daily Pairle</Text></View><Text style={styles.historyPickerStatus}>{round.completed ? 'Done' : 'Open'}</Text></Pressable>)}</View>}
      <View style={styles.historySegment}><Pressable onPress={() => setSide('mine')} style={[styles.historySegmentButton, side === 'mine' && styles.historySegmentActive]}><Text style={[styles.historySegmentText, side === 'mine' && styles.historySegmentTextActive]}>From {dashboard.partnerName || 'them'}</Text></Pressable><Pressable onPress={() => setSide('theirs')} style={[styles.historySegmentButton, side === 'theirs' && styles.historySegmentActive]}><Text style={[styles.historySegmentText, side === 'theirs' && styles.historySegmentTextActive]}>For {dashboard.partnerName || 'them'}</Text></Pressable></View>
      <View style={styles.wordleTopCard}><Text style={styles.eyebrow}>{side === 'mine' ? `MADE BY ${String(dashboard.partnerName || 'YOUR PERSON').toUpperCase()}` : `MADE BY ${String(stats?.myName || 'YOU').toUpperCase()}`}</Text><Text style={styles.wordleStatus}>{historyBoardStatus(board)}</Text><Text style={styles.wordleSub}>{board?.finished && board.answer ? `Answer: ${board.answer}` : board ? 'Saved exactly as it was played.' : 'No word was submitted on this side.'}</Text></View>
      {board ? <Board guesses={board.guesses ?? []} /> : <EmptyHistoryBoard />}
    </ScrollView>
  );
}

function AccountScreen({ dashboard, stats }: { dashboard: Dashboard; stats: PairStats | null }) {
  return <ScrollView contentContainerStyle={styles.pageWithNav}><View style={styles.simpleHeader}><Text style={styles.sectionTitle}>Us</Text><Text style={styles.muted}>The quiet little details.</Text></View><CountdownBar /><View style={styles.profileCard}><View style={styles.avatarCircle}><Text style={styles.avatarText}>{initials(stats?.myName || 'You')}</Text></View><Text style={styles.profileName}>{stats?.myName || 'You'}</Text><Text style={styles.profileMeta}>Your Pairle account</Text></View><View style={styles.pairedCard}><Text style={styles.eyebrow}>YOUR PERSON</Text><View style={styles.partnerLine}><Text style={styles.partnerName}>{dashboard.partnerName}</Text><Text style={styles.softHeart}>♡</Text></View><Text style={styles.pairedSub}>Paired quietly · just the two of you</Text></View><View style={styles.accountStatsRow}><MiniStat label="Days" value={String(stats?.completedGames ?? 0)} /><MiniStat label="Your avg" value={formatAverage(stats?.myAverage)} /><MiniStat label="Their avg" value={formatAverage(stats?.partnerAverage)} /></View><SecondaryButton title="Sign out" onPress={() => supabase.auth.signOut()} /></ScrollView>;
}

function SetWord({ dashboard, onDone, onBack }: { dashboard: Dashboard; onDone: (d: Dashboard) => void; onBack: () => void }) {
  const [word, setWord] = useState(''); const [busy, setBusy] = useState(false);
  async function save() { if (word.length !== 5) return; try { setBusy(true); const { data, error } = await supabase.rpc('submit_word', { word }); if (error) throw error; onDone(data as Dashboard); sendPairlePush('word_sent').catch(() => undefined); Alert.alert('Sent ♡', `${dashboard.partnerName} can now play today’s word.`); } catch (e) { Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again'); } finally { setBusy(false); } }
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Back onPress={onBack} /><CountdownBar /><Text style={styles.eyebrow}>SECRET WORD</Text><Text style={styles.hero}>Pick a word for {dashboard.partnerName}.</Text><Text style={styles.sub}>Five letters. A tiny challenge from you to them.</Text><WordTiles word={word} /><TextInput value={word} onChangeText={(v) => setWord(normalizeWord(v))} autoFocus maxLength={5} autoCapitalize="characters" autoCorrect={false} style={styles.hiddenInput} /><PrimaryButton title={busy ? 'Sending…' : 'Send today’s word'} onPress={save} disabled={busy || word.length !== 5} /></KeyboardAvoidingView>;
}

function PairleKeyboard({ guesses, draft, onChange, onSubmit, busy }: { guesses: ScoredGuess[]; draft: string; onChange: React.Dispatch<React.SetStateAction<string>>; onSubmit: () => void; busy: boolean }) {
  const status = keyboardStatuses(guesses);
  const pressLetter = (letter: string) => {
    if (busy) return;
    onChange((current) => current.length >= 5 ? current : `${current}${letter}`);
  };
  const backspace = () => {
    if (busy) return;
    onChange((current) => current.slice(0, -1));
  };

  return (
    <View style={styles.keyboardWrap}>
      <View style={styles.keyboardHeader}>
        <Text style={styles.keyboardTitle}>YOUR GUESS</Text>
        <Text style={styles.keyboardProgress}>{draft.length}/5</Text>
      </View>
      <View style={styles.keyboardRowsWrap}>
        <View style={styles.keyboardRow}>
          {KEYBOARD_ROWS[0].map((letter) => <KeyboardKey key={letter} label={letter} state={status[letter]} onPress={() => pressLetter(letter)} disabled={busy} />)}
        </View>
        <View style={[styles.keyboardRow, styles.keyboardRowInset]}>
          {KEYBOARD_ROWS[1].map((letter) => <KeyboardKey key={letter} label={letter} state={status[letter]} onPress={() => pressLetter(letter)} disabled={busy} />)}
        </View>
        <View style={styles.keyboardRow}>
          <KeyboardKey label="ENTER" wide onPress={onSubmit} disabled={busy || draft.length !== 5} />
          {KEYBOARD_ROWS[2].map((letter) => <KeyboardKey key={letter} label={letter} state={status[letter]} onPress={() => pressLetter(letter)} disabled={busy} />)}
          <KeyboardKey label="⌫" wide onPress={backspace} disabled={busy || !draft.length} />
        </View>
      </View>
      <View style={styles.keyboardFooter}>
        {busy ? <><ActivityIndicator size="small" color={C.berry} /><Text style={styles.keyboardHint}>Checking word…</Text></> : <Text style={styles.keyboardHelper}>Green = right spot · Gold = in the word</Text>}
      </View>
    </View>
  );
}

function KeyboardKey({ label, state, onPress, wide = false, disabled = false }: { label: string; state?: KeyStatus; onPress: () => void; wide?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '⌫' ? 'Backspace' : label}
      onPressIn={onPress}
      disabled={disabled}
      hitSlop={{ top: 2, bottom: 2, left: 1, right: 1 }}
      pressRetentionOffset={{ top: 10, bottom: 10, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.keyboardKey,
        wide && styles.keyboardKeyWide,
        state === 'correct' && styles.keyboardKeyCorrect,
        state === 'present' && styles.keyboardKeyPresent,
        state === 'absent' && styles.keyboardKeyAbsent,
        pressed && !disabled && styles.keyboardKeyPressed,
        disabled && styles.keyboardKeyDisabled,
      ]}
    >
      <Text pointerEvents="none" style={[styles.keyboardKeyText, state && styles.keyboardKeyTextUsed, wide && styles.keyboardKeyTextWide]}>{label}</Text>
    </Pressable>
  );
}

function CountdownBar() {
  const now = useClock();
  const diff = Math.max(0, nextMidnight(now).getTime() - now.getTime());
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return <View style={styles.countdownBar}><Text style={styles.currentTime}>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text><View style={styles.countdownDivider} /><View style={{ flex: 1 }}><Text style={styles.countdownLabel}>NEXT PAIRLE · MIDNIGHT</Text><Text style={styles.countdownValue}>{hours}h {mins}m {String(secs).padStart(2, '0')}s</Text></View></View>;
}
function BottomNav({ active, onChange }: { active: MainTab; onChange: (tab: MainTab) => void }) { return <View style={styles.bottomNavWrap}><View style={styles.bottomNav}><NavItem label="Today" glyph="⌂" active={active === 'home'} onPress={() => onChange('home')} /><NavItem label="Wordle" glyph="▦" active={active === 'wordle'} onPress={() => onChange('wordle')} /><NavItem label="History" glyph="◷" active={active === 'history'} onPress={() => onChange('history')} /><NavItem label="Us" glyph="♡" active={active === 'account'} onPress={() => onChange('account')} /></View></View>; }
function NavItem({ label, glyph, active, onPress }: { label: string; glyph: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.navItem}><View style={[styles.navIconBubble, active && styles.navIconBubbleActive]}><Text style={[styles.navGlyph, active && styles.navGlyphActive]}>{glyph}</Text></View><Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text></Pressable>; }
function Board({ guesses, draft = '' }: { guesses: ScoredGuess[]; draft?: string }) { return <View style={styles.board}>{Array.from({ length: 6 }).map((_, r) => <GuessRow key={r} guess={guesses[r]} draft={r === guesses.length ? draft : ''} />)}</View>; }
function EmptyHistoryBoard() { return <View style={styles.board}>{Array.from({ length: 6 }).map((_, r) => <GuessRow key={r} draft="" />)}</View>; }
function ProgressLine({ dashboard }: { dashboard: Dashboard }) { return <View style={styles.progressWrap}><View style={styles.progressRail} /><ProgressStep label="Yours sent" active={!!dashboard.myWordReady} /><ProgressStep label="Theirs ready" active={!!dashboard.partnerWordReady} /><ProgressStep label="Both done" active={!!dashboard.completed} /></View>; }
function ProgressStep({ label, active }: { label: string; active: boolean }) { return <View style={styles.progressStep}><View style={[styles.progressDot, active && styles.progressDotActive]} /><Text style={styles.progressLabel}>{label}</Text></View>; }
function StatPerson({ name, average, wins }: { name: string; average?: number | null; wins: number }) { return <View style={styles.statPerson}><Text numberOfLines={1} style={styles.statName}>{name}</Text><Text style={styles.statAverage}>{formatAverage(average)}</Text><Text style={styles.statCaption}>avg guesses</Text><Text style={styles.statWins}>{wins} faster days</Text></View>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <View style={styles.miniStat}><Text style={styles.miniStatValue}>{value}</Text><Text style={styles.miniStatLabel}>{label}</Text></View>; }
function GuessRow({ guess, draft }: { guess?: ScoredGuess; draft: string }) { const word = guess?.word ?? draft; return <View style={styles.row}>{Array.from({ length: 5 }).map((_, i) => <View key={i} style={[styles.tile, !guess && !!word[i] && styles.tileDraftFilled, guess?.states[i] === 'correct' && styles.correct, guess?.states[i] === 'present' && styles.present, guess?.states[i] === 'absent' && styles.absent]}><Text style={[styles.tileText, guess && { color: '#fff' }]}>{word[i] ?? ''}</Text></View>)}</View>; }
function WordTiles({ word }: { word: string }) { return <View style={styles.wordEntry}>{Array.from({ length: 5 }).map((_, i) => <View key={i} style={[styles.bigTile, word[i] && styles.bigTileFilled]}><Text style={styles.bigTileText}>{word[i] ?? ''}</Text></View>)}</View>; }
function ActionCard({ title, status, detail, button, onPress }: { title: string; status: string; detail?: string; button?: string; onPress: () => void }) { return <View style={styles.actionCard}><Text style={styles.eyebrow}>{title.toUpperCase()}</Text><Text style={styles.actionStatus}>{status}</Text>{detail && <Text style={styles.actionDetail}>{detail}</Text>}{button && <PrimaryButton title={button} onPress={onPress} />}</View>; }
function Input(props: any) { const { label, ...rest } = props; return <View style={{ marginBottom: 16 }}><Text style={styles.label}>{label}</Text><TextInput {...rest} style={styles.input} /></View>; }
function Segment({ active, title, onPress }: { active: boolean; title: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentActive]}><Text style={[styles.segmentText, active && styles.segmentTextActive]}>{title}</Text></Pressable>; }
function PrimaryButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && { opacity: .35 }]}><Text style={styles.primaryButtonText}>{title}</Text></Pressable>; }
function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{title}</Text></Pressable>; }
function SocialButton({ title, mark, onPress }: { title: string; mark: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.socialButton}><Text style={styles.socialMark}>{mark}</Text><Text style={styles.socialButtonText}>{title}</Text><View style={{ width: 24 }} /></Pressable>; }
function Back({ onPress }: { onPress: () => void }) { return <Pressable onPress={onPress} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>; }
function Centered({ children }: { children: React.ReactNode }) { return <SafeAreaView style={styles.center}>{children}</SafeAreaView>; }
function resultText(r?: Dashboard['myResult']) { if (!r) return 'Waiting'; return r.solved ? `Solved in ${r.guesses.length}/6` : r.finished ? `Missed · ${r.answer}` : 'Ready'; }
function historyBoardStatus(board: BoardSnapshot) { if (!board) return 'No word this day'; if (board.solved) return `Solved in ${board.guesses.length}/6`; if (board.finished) return `Missed · ${board.answer ?? ''}`; return `${board.guesses.length}/6 guesses used`; }
function prettyDate() { return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
function formatAverage(v?: number | null) { return typeof v === 'number' ? v.toFixed(2).replace(/\.00$/, '') : '—'; }
function initials(name: string) { return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'P'; }
function useClock() { const [now, setNow] = useState(new Date()); useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []); return now; }
function nextMidnight(now: Date) { const next = new Date(now); next.setHours(24, 0, 0, 0); return next; }
function historyDate(round?: HistoryRound) { if (!round) return new Date(); const [y, m, d] = round.displayAt.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 12); }
function formatRoundDate(round?: HistoryRound) { return historyDate(round).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' }); }

async function isValidEnglishGuess(word: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`, { signal: controller.signal });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error('Word check is unavailable right now. Try again.');
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Word check timed out. Try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function keyboardStatuses(guesses: ScoredGuess[]) {
  const statuses: Record<string, KeyStatus> = {};
  const rank: Record<TileState, number> = { absent: 1, present: 2, correct: 3 };
  guesses.forEach((guess) => {
    guess.word.split('').forEach((letter, index) => {
      const next = guess.states[index];
      const current = statuses[letter];
      if (!current || rank[next] > rank[current]) statuses[letter] = next;
    });
  });
  return statuses;
}

const C = { bg: '#FFF9F7', paper: '#FFFFFF', berry: '#A85F72', lavenderSoft: '#F3EEFB', text: '#2E2A2B', muted: '#8C7F82', border: '#EFD8DC', roseSoft: '#FDE8EA', sage: '#8FB996', grayTile: '#D9D2D3' };
const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},appShell:{flex:1,backgroundColor:C.bg},screenArea:{flex:1},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.bg},page:{flexGrow:1,padding:22,backgroundColor:C.bg},pageWithNav:{flexGrow:1,paddingHorizontal:22,paddingTop:18,paddingBottom:120,backgroundColor:C.bg},centerContent:{justifyContent:'center'},
  authPage:{flex:1,backgroundColor:C.bg},authScroll:{flexGrow:1,paddingHorizontal:24,paddingTop:26,paddingBottom:36},authLogo:{fontSize:31,fontWeight:'900',letterSpacing:-1.3,color:C.text,marginBottom:32},authHero:{fontSize:39,lineHeight:43,fontWeight:'900',letterSpacing:-1.5,color:C.text},authSub:{fontSize:16,lineHeight:24,color:C.muted,marginTop:12,marginBottom:8},authCard:{backgroundColor:C.paper,borderRadius:28,padding:20,marginTop:18,borderWidth:1.5,borderColor:C.border},orText:{textAlign:'center',color:'#B09CA0',fontWeight:'800',marginVertical:15,fontSize:12},socialButton:{minHeight:56,borderRadius:18,borderWidth:1.5,borderColor:C.border,backgroundColor:C.paper,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,marginBottom:10},socialMark:{width:24,fontSize:18,fontWeight:'900',color:C.text,textAlign:'center'},socialButtonText:{fontSize:15,fontWeight:'900',color:C.text},authFooterRow:{flexDirection:'row',justifyContent:'center',marginTop:20},authFooterText:{color:C.muted,fontSize:14,fontWeight:'700'},authFooterLink:{color:C.berry,fontSize:14,fontWeight:'900'},
  onboardingPage:{flex:1,paddingHorizontal:26,paddingTop:24,paddingBottom:28,backgroundColor:C.bg},onboardingTopRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},stepCount:{color:C.muted,fontWeight:'900',fontSize:12},onboardingArt:{height:235,marginTop:34,marginBottom:30,borderRadius:38,backgroundColor:C.roseSoft,borderWidth:1.5,borderColor:'#F2C8CE',alignItems:'center',justifyContent:'center'},onboardingArtText:{fontSize:104,lineHeight:116,fontWeight:'900',color:C.berry,letterSpacing:-5},onboardingWordArt:{fontSize:54,letterSpacing:7},onboardingHero:{fontSize:42,lineHeight:45,fontWeight:'900',color:C.text,letterSpacing:-1.7,marginTop:9},onboardingBody:{fontSize:17,lineHeight:26,color:C.muted,marginTop:13},onboardingBottom:{marginTop:'auto',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},dotsRow:{flexDirection:'row',gap:7},onboardingDot:{width:8,height:8,borderRadius:4,backgroundColor:'#E6D7DA'},onboardingDotActive:{width:24,backgroundColor:C.berry},nextCircle:{width:62,height:62,borderRadius:31,alignItems:'center',justifyContent:'center',backgroundColor:C.berry},nextArrow:{color:'#fff',fontWeight:'800',fontSize:27},
  logo:{fontSize:31,fontWeight:'900',letterSpacing:-1.3,color:C.text},logoHeart:{color:C.berry},hero:{fontSize:38,lineHeight:42,fontWeight:'900',letterSpacing:-1.5,color:C.text,marginTop:8},sectionTitle:{fontSize:32,fontWeight:'900',color:C.text,letterSpacing:-1.1},sub:{fontSize:16,lineHeight:24,color:C.muted,marginTop:12,marginBottom:22},subCompact:{fontSize:16,lineHeight:24,color:'#7D686D',marginTop:12},muted:{fontSize:14,color:C.muted,marginTop:3},eyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.5,color:C.berry},card:{backgroundColor:C.paper,borderRadius:24,padding:18,marginVertical:20,borderWidth:1,borderColor:C.border},label:{fontSize:11,fontWeight:'900',letterSpacing:1.2,color:C.berry},input:{marginTop:7,fontSize:17,fontWeight:'700',paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.border,color:C.text},segment:{flexDirection:'row',backgroundColor:'#F5E9EB',padding:4,borderRadius:16,marginTop:20},segmentButton:{flex:1,padding:12,alignItems:'center',borderRadius:12},segmentActive:{backgroundColor:C.paper},segmentText:{fontWeight:'800',color:C.muted},segmentTextActive:{color:C.berry},
  primaryButton:{backgroundColor:C.berry,minHeight:56,borderRadius:18,alignItems:'center',justifyContent:'center',marginTop:12},primaryButtonText:{color:'#fff',fontSize:16,fontWeight:'900'},secondaryButton:{borderWidth:1.5,borderColor:C.border,minHeight:54,borderRadius:18,alignItems:'center',justifyContent:'center',marginTop:14,backgroundColor:C.paper},secondaryButtonText:{fontSize:15,fontWeight:'800',color:C.berry},back:{alignSelf:'flex-start',paddingVertical:8,paddingRight:16},backText:{fontWeight:'800',fontSize:16,color:C.berry},headerRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},simpleHeader:{marginBottom:2},streakCard:{minWidth:102,backgroundColor:C.paper,borderRadius:26,paddingHorizontal:16,paddingVertical:10,borderWidth:1.5,borderColor:C.border,alignItems:'center'},streakNumber:{fontSize:25,fontWeight:'900',color:C.berry,lineHeight:28},streakLabel:{fontSize:12,color:C.muted,fontWeight:'800'},
  countdownBar:{marginTop:18,marginBottom:6,backgroundColor:'#FFFDFD',borderWidth:1,borderColor:C.border,borderRadius:18,paddingHorizontal:15,paddingVertical:12,flexDirection:'row',alignItems:'center'},currentTime:{fontSize:18,fontWeight:'900',color:C.text,minWidth:72},countdownDivider:{height:28,width:1,backgroundColor:C.border,marginHorizontal:13},countdownLabel:{fontSize:9,letterSpacing:1.2,color:C.muted,fontWeight:'900'},countdownValue:{marginTop:2,fontSize:14,color:C.berry,fontWeight:'900'},heroCard:{marginTop:18,borderRadius:30,padding:24,backgroundColor:C.roseSoft,borderWidth:1.5,borderColor:'#F2C8CE'},cardHero:{fontSize:29,lineHeight:34,fontWeight:'900',color:C.text,marginTop:10,letterSpacing:-1},progressWrap:{marginTop:27,flexDirection:'row',justifyContent:'space-between',position:'relative'},progressRail:{position:'absolute',left:18,right:18,top:8,height:3,borderRadius:2,backgroundColor:'#EECED3'},progressStep:{width:'31%',alignItems:'center'},progressDot:{width:17,height:17,borderRadius:9,backgroundColor:'#E7C4CA',marginBottom:8},progressDotActive:{backgroundColor:C.berry},progressLabel:{fontSize:11,fontWeight:'800',color:'#8B7479',textAlign:'center'},
  statsCard:{backgroundColor:C.paper,borderRadius:27,padding:20,marginTop:14,borderWidth:1.5,borderColor:C.border},statsHeaderRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},statsTitle:{fontSize:22,fontWeight:'900',color:C.text,marginTop:5},statsMini:{fontSize:12,color:C.muted,fontWeight:'800',backgroundColor:'#FAF0F2',paddingHorizontal:10,paddingVertical:6,borderRadius:999},statCompareRow:{flexDirection:'row',alignItems:'center',marginTop:22},statPerson:{flex:1,alignItems:'center'},statName:{fontSize:14,fontWeight:'900',color:C.text,maxWidth:110},statAverage:{fontSize:31,fontWeight:'900',color:C.berry,marginTop:3},statCaption:{fontSize:11,color:C.muted,fontWeight:'700'},statWins:{marginTop:7,fontSize:11,color:'#7D686D',fontWeight:'800'},vsPill:{width:38,height:38,borderRadius:19,backgroundColor:C.lavenderSoft,alignItems:'center',justifyContent:'center'},vsText:{color:'#8977A3',fontWeight:'900',fontSize:12},statsFoot:{textAlign:'center',marginTop:18,color:C.muted,fontSize:11,fontWeight:'700'},actionCard:{backgroundColor:'#FFF6F3',borderRadius:26,padding:21,marginTop:14,borderWidth:1.5,borderColor:'#F2D6D1'},lavenderCard:{backgroundColor:C.lavenderSoft,borderColor:'#DED2F2'},actionStatus:{fontSize:24,fontWeight:'900',color:C.text,marginTop:8},actionDetail:{fontSize:15,lineHeight:21,color:C.muted,marginTop:7},inviteCode:{fontSize:44,fontWeight:'900',letterSpacing:8,textAlign:'center',marginVertical:24,color:C.berry},refreshLink:{paddingVertical:24,alignItems:'center'},refreshText:{color:C.berry,fontWeight:'900',fontSize:15},
  waitingCard:{marginTop:18,borderRadius:28,padding:24,backgroundColor:C.lavenderSoft,borderWidth:1.5,borderColor:'#DDD0F0'},wordleTopCard:{marginTop:18,borderRadius:22,padding:18,backgroundColor:C.roseSoft,borderWidth:1,borderColor:'#F0D0D5'},wordleStatus:{fontSize:24,fontWeight:'900',color:C.text,marginTop:5},wordleSub:{marginTop:6,fontSize:13,lineHeight:18,color:C.muted},board:{gap:8,marginVertical:22},row:{flexDirection:'row',justifyContent:'center',gap:8},tile:{width:54,height:54,borderWidth:2,borderColor:C.grayTile,borderRadius:10,backgroundColor:C.paper,alignItems:'center',justifyContent:'center'},tileDraftFilled:{borderColor:C.berry,backgroundColor:'#FFFDFD',shadowColor:'#6D4D55',shadowOpacity:.06,shadowRadius:4,shadowOffset:{width:0,height:2}},tileText:{fontSize:23,fontWeight:'900',color:C.text},correct:{backgroundColor:C.sage,borderColor:C.sage},present:{backgroundColor:'#D8B86A',borderColor:'#D8B86A'},absent:{backgroundColor:'#8D8587',borderColor:'#8D8587'},guessInput:{minHeight:56,borderRadius:17,backgroundColor:C.paper,borderWidth:1.5,borderColor:C.border,paddingHorizontal:16,textAlign:'center',fontSize:18,fontWeight:'900',letterSpacing:2,color:C.text},finishedNote:{backgroundColor:C.paper,borderRadius:18,padding:15,borderWidth:1,borderColor:C.border},finishedNoteText:{textAlign:'center',color:C.berry,fontWeight:'900'},
  keyboardWrap:{marginTop:0,marginBottom:14,paddingHorizontal:9,paddingTop:11,paddingBottom:9,borderRadius:18,backgroundColor:'#FFFDFD',borderWidth:1,borderColor:'#F0DFE2',shadowColor:'#6D4D55',shadowOpacity:.05,shadowRadius:8,shadowOffset:{width:0,height:3}},keyboardHeader:{height:24,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:2},keyboardTitle:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:C.muted},keyboardProgress:{fontSize:10,fontWeight:'900',color:C.berry},keyboardRowsWrap:{gap:6,marginTop:3},keyboardRow:{flexDirection:'row',justifyContent:'center',gap:4},keyboardRowInset:{paddingHorizontal:15},keyboardKey:{flex:1,flexBasis:0,height:50,borderRadius:8,backgroundColor:'#EDE6E7',alignItems:'center',justifyContent:'center',minWidth:0,borderWidth:1,borderColor:'#E7DCDE'},keyboardKeyWide:{flex:1.5},keyboardKeyCorrect:{backgroundColor:C.sage,borderColor:C.sage},keyboardKeyPresent:{backgroundColor:'#D8B86A',borderColor:'#D8B86A'},keyboardKeyAbsent:{backgroundColor:'#8D8587',borderColor:'#8D8587'},keyboardKeyPressed:{transform:[{scale:.96}],opacity:.82},keyboardKeyDisabled:{opacity:.42},keyboardKeyText:{fontSize:14,fontWeight:'900',color:C.text},keyboardKeyTextUsed:{color:'#fff'},keyboardKeyTextWide:{fontSize:9,letterSpacing:.2},keyboardFooter:{minHeight:25,marginTop:5,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},keyboardHint:{fontSize:11,fontWeight:'800',color:C.muted},keyboardHelper:{fontSize:10,fontWeight:'700',color:C.muted},
  historyDateRow:{marginTop:18,backgroundColor:C.paper,borderWidth:1.5,borderColor:C.border,borderRadius:24,padding:10,flexDirection:'row',alignItems:'center'},historyArrow:{width:48,height:48,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:C.roseSoft},historyArrowDisabled:{opacity:.28},historyArrowText:{fontSize:32,lineHeight:34,color:C.berry,fontWeight:'700'},historyDateCenter:{flex:1,alignItems:'center',paddingHorizontal:6},historyDate:{fontSize:17,color:C.text,fontWeight:'900'},historyTime:{marginTop:3,fontSize:11,color:C.muted,fontWeight:'700'},historyPicker:{marginTop:10,backgroundColor:C.paper,borderWidth:1.5,borderColor:C.border,borderRadius:24,padding:14},historyPickerRow:{minHeight:56,borderRadius:16,paddingHorizontal:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8},historyPickerRowActive:{backgroundColor:C.roseSoft},historyPickerDate:{fontSize:14,color:C.text,fontWeight:'900'},historyPickerTime:{marginTop:2,fontSize:11,color:C.muted},historyPickerStatus:{color:C.berry,fontWeight:'900',fontSize:11},historySegment:{marginTop:14,flexDirection:'row',backgroundColor:'#F5E9EB',padding:4,borderRadius:18},historySegmentButton:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:14,paddingHorizontal:8},historySegmentActive:{backgroundColor:C.paper},historySegmentText:{color:C.muted,fontWeight:'800',fontSize:12},historySegmentTextActive:{color:C.berry},
  profileCard:{marginTop:18,alignItems:'center',backgroundColor:C.paper,borderRadius:28,padding:24,borderWidth:1.5,borderColor:C.border},avatarCircle:{width:72,height:72,borderRadius:36,backgroundColor:C.roseSoft,alignItems:'center',justifyContent:'center'},avatarText:{color:C.berry,fontWeight:'900',fontSize:24},profileName:{fontSize:25,fontWeight:'900',color:C.text,marginTop:12},profileMeta:{fontSize:13,color:C.muted,marginTop:3},pairedCard:{marginTop:14,backgroundColor:C.lavenderSoft,borderRadius:26,padding:21,borderWidth:1.5,borderColor:'#DED2F2'},partnerLine:{flexDirection:'row',alignItems:'center',marginTop:6},partnerName:{fontSize:26,fontWeight:'900',color:C.text},softHeart:{fontSize:25,color:C.berry,marginLeft:8},pairedSub:{marginTop:6,color:C.muted,fontSize:14},accountStatsRow:{flexDirection:'row',gap:9,marginTop:14},miniStat:{flex:1,backgroundColor:C.paper,borderRadius:20,paddingVertical:16,paddingHorizontal:8,alignItems:'center',borderWidth:1,borderColor:C.border},miniStatValue:{fontSize:22,fontWeight:'900',color:C.berry},miniStatLabel:{marginTop:4,fontSize:10,color:C.muted,fontWeight:'800',textAlign:'center'},wordEntry:{flexDirection:'row',justifyContent:'space-between',marginVertical:28},bigTile:{width:'18%',aspectRatio:.85,borderRadius:13,borderWidth:2,borderColor:C.border,backgroundColor:C.paper,alignItems:'center',justifyContent:'center'},bigTileFilled:{borderColor:C.berry,backgroundColor:'#FFF4F6'},bigTileText:{fontSize:28,fontWeight:'900',color:C.text},hiddenInput:{opacity:.02,height:5},bottomNavWrap:{position:'absolute',left:18,right:18,bottom:Platform.OS === 'ios' ? 12 : 10},bottomNav:{height:72,backgroundColor:'#FFFDFD',borderRadius:24,borderWidth:1.5,borderColor:C.border,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:7,shadowColor:'#6D4D55',shadowOpacity:.08,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:5},navItem:{flex:1,alignItems:'center',justifyContent:'center'},navIconBubble:{width:31,height:31,borderRadius:16,alignItems:'center',justifyContent:'center'},navIconBubbleActive:{backgroundColor:C.roseSoft},navGlyph:{fontSize:18,fontWeight:'900',color:'#A69599'},navGlyphActive:{color:C.berry},navLabel:{fontSize:9,fontWeight:'800',color:'#A69599',marginTop:2},navLabelActive:{color:C.berry}
});