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
type MainTab = 'home' | 'wordle' | 'account';
type Screen = MainTab | 'setWord';

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

  if (booting) return <Centered><ActivityIndicator size="large" /></Centered>;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
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
      <View style={styles.brandPill}><Text style={styles.brandPillText}>PAIRLE</Text></View>
      <Text style={styles.hero}>One word for your person, every day.</Text>
      <Text style={styles.sub}>Pair once. From then on, today's game is waiting whenever you open the app.</Text>

      <View style={styles.segment}>
        <Segment active={mode === 'signup'} title="Create account" onPress={() => setMode('signup')} />
        <Segment active={mode === 'signin'} title="Sign in" onPress={() => setMode('signin')} />
      </View>

      <View style={styles.card}>
        {mode === 'signup' && <Input label="YOUR NAME" value={name} onChangeText={setName} placeholder="Ayush" />}
        <Input label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@email.com" autoCapitalize="none" />
        <Input label="PASSWORD" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
      </View>
      <PrimaryButton title={busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'} onPress={submit} disabled={busy} />
    </KeyboardAvoidingView>
  );
}

function PairleApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [stats, setStats] = useState<PairStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');

  async function refresh(quiet = false) {
    try {
      if (!quiet) setLoading(true);
      const [{ data, error }, { data: statData, error: statError }] = await Promise.all([
        supabase.rpc('get_pair_dashboard'),
        supabase.rpc('get_pair_stats'),
      ]);
      if (error) throw error;
      if (statError) throw statError;
      setDashboard(data as Dashboard);
      setStats(statData as PairStats);
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

  if (loading && !dashboard) return <Centered><ActivityIndicator size="large" /></Centered>;
  if (!dashboard?.paired) return <PairSetup onDone={refresh} />;
  if (screen === 'setWord') return <SetWord dashboard={dashboard} onDone={(d) => { setDashboard(d); refresh(true); setScreen('home'); }} onBack={() => setScreen('home')} />;

  const tab = screen as MainTab;
  return (
    <View style={styles.appShell}>
      <View style={styles.screenArea}>
        {tab === 'home' && <Home dashboard={dashboard} stats={stats} onSetWord={() => setScreen('setWord')} onRefresh={refresh} />}
        {tab === 'wordle' && <WordleScreen dashboard={dashboard} onDone={(d) => { setDashboard(d); refresh(true); }} />}
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
        <CountdownBar />
        <Text style={styles.eyebrow}>ONE-TIME INVITE</Text>
        <Text style={[styles.hero, { textAlign: 'center' }]}>Send this code to your partner</Text>
        <Text style={styles.inviteCode}>{createdCode}</Text>
        <Text style={[styles.sub, { textAlign: 'center' }]}>You will never need this code again after they join.</Text>
        <PrimaryButton title="They joined — check" onPress={onDone} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <CountdownBar />
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

function Home({ dashboard, stats, onSetWord, onRefresh }: { dashboard: Dashboard; stats: PairStats | null; onSetWord: () => void; onRefresh: () => void }) {
  const waitingForPartner = !dashboard.partnerJoined;
  const myAvg = stats?.myAverage;
  const partnerAvg = stats?.partnerAverage;

  return (
    <ScrollView contentContainerStyle={styles.pageWithNav}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.logo}>Pairle <Text style={styles.logoHeart}>♡</Text></Text>
          <Text style={styles.muted}>{prettyDate()}</Text>
        </View>
        <View style={styles.streakCard}><Text style={styles.streakNumber}>{dashboard.streak ?? 0}</Text><Text style={styles.streakLabel}>day streak</Text></View>
      </View>

      <CountdownBar />

      {waitingForPartner ? (
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>WAITING FOR YOUR PARTNER</Text>
          <Text style={styles.cardHero}>Invite code: {dashboard.inviteCode}</Text>
          <Text style={styles.subCompact}>Once they join, this becomes your shared daily Pairle.</Text>
          <SecondaryButton title="Refresh" onPress={onRefresh} />
        </View>
      ) : (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>TODAY'S PAIRLE</Text>
            <Text style={styles.cardHero}>{dashboard.completed ? 'You both finished.' : `You + ${dashboard.partnerName}`}</Text>
            <Text style={styles.subCompact}>{dashboard.completed ? 'Today’s little ritual is done. Come back tomorrow for a fresh word.' : 'A tiny daily challenge, made for each other.'}</Text>
            <ProgressLine dashboard={dashboard} />
          </View>

          <View style={styles.statsCard}>
            <View style={styles.statsHeaderRow}>
              <View>
                <Text style={styles.eyebrow}>GUESS RACE</Text>
                <Text style={styles.statsTitle}>Who gets there faster?</Text>
              </View>
              <Text style={styles.statsMini}>{stats?.completedGames ?? 0} days</Text>
            </View>

            <View style={styles.statCompareRow}>
              <StatPerson name={stats?.myName || 'You'} average={myAvg} wins={stats?.myWins ?? 0} />
              <View style={styles.vsPill}><Text style={styles.vsText}>vs</Text></View>
              <StatPerson name={stats?.partnerName || dashboard.partnerName || 'Partner'} average={partnerAvg} wins={stats?.partnerWins ?? 0} />
            </View>
            <Text style={styles.statsFoot}>Average guesses on solved words · {stats?.ties ?? 0} ties</Text>
          </View>

          <ActionCard title={`For ${dashboard.partnerName}`} status={dashboard.myWordReady ? 'Word locked in' : 'Pick today’s word'} detail={dashboard.myWordReady ? 'They’ll get it whenever they’re ready.' : 'Choose a five-letter word just for them.'} button={!dashboard.myWordReady ? 'Create word' : undefined} onPress={onSetWord} />

          <View style={[styles.actionCard, styles.lavenderCard]}>
            <Text style={styles.eyebrow}>FROM {dashboard.partnerName?.toUpperCase()}</Text>
            <Text style={styles.actionStatus}>{dashboard.partnerWordReady ? dashboard.myResult?.finished ? resultText(dashboard.myResult) : 'Ready for you' : `Waiting on ${dashboard.partnerName}…`}</Text>
            <Text style={styles.actionDetail}>{dashboard.myResult?.finished ? 'Your board is still saved in the Wordle tab.' : dashboard.partnerWordReady ? 'Open Wordle whenever you want to play.' : 'You’ll get a notification when their word is ready.'}</Text>
          </View>
        </>
      )}

      <Pressable style={styles.refreshLink} onPress={onRefresh}><Text style={styles.refreshText}>Refresh</Text></Pressable>
    </ScrollView>
  );
}

function WordleScreen({ dashboard, onDone }: { dashboard: Dashboard; onDone: (d: Dashboard) => void }) {
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
        Alert.alert(next.myResult.solved ? 'Nice ♡' : 'That one was sneaky', next.myResult.solved ? `Solved in ${next.myResult.guesses.length}/6.` : `The word was ${next.myResult.answer}.`);
      }
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pageWithNav} keyboardShouldPersistTaps="handled">
      <View style={styles.simpleHeader}>
        <Text style={styles.sectionTitle}>Wordle</Text>
        <Text style={styles.muted}>From {dashboard.partnerName}</Text>
      </View>
      <CountdownBar />

      {!dashboard.partnerWordReady ? (
        <View style={styles.waitingCard}>
          <Text style={styles.eyebrow}>NOT READY YET</Text>
          <Text style={styles.cardHero}>Waiting on {dashboard.partnerName}.</Text>
          <Text style={styles.subCompact}>We’ll keep this spot ready. You’ll get a notification when their word lands.</Text>
        </View>
      ) : (
        <>
          <View style={styles.wordleTopCard}>
            <Text style={styles.eyebrow}>TODAY'S WORD</Text>
            <Text style={styles.wordleStatus}>{dashboard.myResult?.finished ? resultText(dashboard.myResult) : `${guesses.length}/6 guesses used`}</Text>
            {dashboard.myResult?.finished && <Text style={styles.wordleSub}>This board stays here for the rest of today.</Text>}
          </View>

          <View style={styles.board}>
            {Array.from({ length: 6 }).map((_, r) => <GuessRow key={r} guess={guesses[r]} draft={r === guesses.length && !dashboard.myResult?.finished ? draft : ''} />)}
          </View>

          {!dashboard.myResult?.finished ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TextInput value={draft} onChangeText={(v) => setDraft(normalizeWord(v))} maxLength={5} autoCapitalize="characters" autoCorrect={false} style={styles.guessInput} placeholder="TYPE YOUR GUESS" placeholderTextColor="#A69599" />
              <PrimaryButton title={busy ? 'Checking…' : 'Submit guess'} onPress={submit} disabled={busy || draft.length !== 5} />
            </KeyboardAvoidingView>
          ) : (
            <View style={styles.finishedNote}>
              <Text style={styles.finishedNoteText}>{dashboard.myResult.solved ? `Solved in ${guesses.length}. Nicely done.` : `Answer: ${dashboard.myResult.answer}`}</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function AccountScreen({ dashboard, stats }: { dashboard: Dashboard; stats: PairStats | null }) {
  return (
    <ScrollView contentContainerStyle={styles.pageWithNav}>
      <View style={styles.simpleHeader}>
        <Text style={styles.sectionTitle}>Us</Text>
        <Text style={styles.muted}>The quiet little details.</Text>
      </View>
      <CountdownBar />

      <View style={styles.profileCard}>
        <View style={styles.avatarCircle}><Text style={styles.avatarText}>{initials(stats?.myName || 'You')}</Text></View>
        <Text style={styles.profileName}>{stats?.myName || 'You'}</Text>
        <Text style={styles.profileMeta}>Your Pairle account</Text>
      </View>

      <View style={styles.pairedCard}>
        <Text style={styles.eyebrow}>PAIRED WITH</Text>
        <View style={styles.partnerLine}>
          <Text style={styles.partnerName}>{dashboard.partnerName}</Text>
          <Text style={styles.softHeart}>♡</Text>
        </View>
        <Text style={styles.pairedSub}>Just the two of you · {dashboard.streak ?? 0} day streak</Text>
      </View>

      <View style={styles.accountStatsRow}>
        <MiniStat label="Days together" value={String(stats?.completedGames ?? 0)} />
        <MiniStat label="Your avg" value={formatAverage(stats?.myAverage)} />
        <MiniStat label="Their avg" value={formatAverage(stats?.partnerAverage)} />
      </View>

      <SecondaryButton title="Sign out" onPress={() => supabase.auth.signOut()} />
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
      <CountdownBar />
      <Text style={styles.eyebrow}>SECRET WORD</Text>
      <Text style={styles.hero}>Pick a word for {dashboard.partnerName}.</Text>
      <Text style={styles.sub}>Five letters. A tiny challenge from you to them.</Text>
      <WordTiles word={word} />
      <TextInput value={word} onChangeText={(v) => setWord(normalizeWord(v))} autoFocus maxLength={5} autoCapitalize="characters" autoCorrect={false} style={styles.hiddenInput} />
      <PrimaryButton title={busy ? 'Sending…' : 'Send today’s word'} onPress={save} disabled={busy || word.length !== 5} />
    </KeyboardAvoidingView>
  );
}

function CountdownBar() {
  const now = useClock();
  const next = nextMorning(now);
  const diff = Math.max(0, next.getTime() - now.getTime());
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return (
    <View style={styles.countdownBar}>
      <Text style={styles.currentTime}>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
      <View style={styles.countdownDivider} />
      <View style={{ flex: 1 }}>
        <Text style={styles.countdownLabel}>NEXT PAIRLE</Text>
        <Text style={styles.countdownValue}>{hours}h {mins}m {secs}s</Text>
      </View>
    </View>
  );
}

function BottomNav({ active, onChange }: { active: MainTab; onChange: (tab: MainTab) => void }) {
  return (
    <View style={styles.bottomNavWrap}>
      <View style={styles.bottomNav}>
        <NavItem label="Today" glyph="⌂" active={active === 'home'} onPress={() => onChange('home')} />
        <NavItem label="Wordle" glyph="▦" active={active === 'wordle'} onPress={() => onChange('wordle')} />
        <NavItem label="Us" glyph="♡" active={active === 'account'} onPress={() => onChange('account')} />
      </View>
    </View>
  );
}

function NavItem({ label, glyph, active, onPress }: { label: string; glyph: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.navItem}>
      <View style={[styles.navIconBubble, active && styles.navIconBubbleActive]}><Text style={[styles.navGlyph, active && styles.navGlyphActive]}>{glyph}</Text></View>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function ProgressLine({ dashboard }: { dashboard: Dashboard }) {
  const sent = !!dashboard.myWordReady;
  const theirs = !!dashboard.partnerWordReady;
  const done = !!dashboard.completed;
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressRail} />
      <ProgressStep label="Yours sent" active={sent} />
      <ProgressStep label="Theirs ready" active={theirs} />
      <ProgressStep label="Both done" active={done} />
    </View>
  );
}

function ProgressStep({ label, active }: { label: string; active: boolean }) {
  return <View style={styles.progressStep}><View style={[styles.progressDot, active && styles.progressDotActive]} /><Text style={styles.progressLabel}>{label}</Text></View>;
}

function StatPerson({ name, average, wins }: { name: string; average?: number | null; wins: number }) {
  return (
    <View style={styles.statPerson}>
      <Text numberOfLines={1} style={styles.statName}>{name}</Text>
      <Text style={styles.statAverage}>{formatAverage(average)}</Text>
      <Text style={styles.statCaption}>avg guesses</Text>
      <Text style={styles.statWins}>{wins} faster days</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.miniStat}><Text style={styles.miniStatValue}>{value}</Text><Text style={styles.miniStatLabel}>{label}</Text></View>;
}

function GuessRow({ guess, draft }: { guess?: ScoredGuess; draft: string }) {
  const word = guess?.word ?? draft;
  return (
    <View style={styles.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={[styles.tile, guess?.states[i] === 'correct' && styles.correct, guess?.states[i] === 'present' && styles.present, guess?.states[i] === 'absent' && styles.absent]}>
          <Text style={[styles.tileText, guess && { color: '#fff' }]}>{word[i] ?? ''}</Text>
        </View>
      ))}
    </View>
  );
}

function WordTiles({ word }: { word: string }) {
  return <View style={styles.wordEntry}>{Array.from({ length: 5 }).map((_, i) => <View key={i} style={[styles.bigTile, word[i] && styles.bigTileFilled]}><Text style={styles.bigTileText}>{word[i] ?? ''}</Text></View>)}</View>;
}

function ActionCard({ title, status, detail, button, onPress }: { title: string; status: string; detail?: string; button?: string; onPress: () => void }) {
  return <View style={styles.actionCard}><Text style={styles.eyebrow}>{title.toUpperCase()}</Text><Text style={styles.actionStatus}>{status}</Text>{detail && <Text style={styles.actionDetail}>{detail}</Text>}{button && <PrimaryButton title={button} onPress={onPress} />}</View>;
}
function Input(props: any) { const { label, ...rest } = props; return <View style={{ marginBottom: 16 }}><Text style={styles.label}>{label}</Text><TextInput {...rest} style={styles.input} /></View>; }
function Segment({ active, title, onPress }: { active: boolean; title: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentActive]}><Text style={[styles.segmentText, active && styles.segmentTextActive]}>{title}</Text></Pressable>; }
function PrimaryButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && { opacity: .35 }]}><Text style={styles.primaryButtonText}>{title}</Text></Pressable>; }
function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{title}</Text></Pressable>; }
function Back({ onPress }: { onPress: () => void }) { return <Pressable onPress={onPress} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>; }
function Centered({ children }: { children: React.ReactNode }) { return <SafeAreaView style={styles.center}>{children}</SafeAreaView>; }
function resultText(r?: Dashboard['myResult']) { if (!r) return 'Waiting'; return r.solved ? `Solved in ${r.guesses.length}/6` : r.finished ? `Missed · ${r.answer}` : 'Ready'; }
function prettyDate() { return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
function formatAverage(v?: number | null) { return typeof v === 'number' ? v.toFixed(2).replace(/\.00$/, '') : '—'; }
function initials(name: string) { return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'P'; }
function useClock() { const [now, setNow] = useState(new Date()); useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []); return now; }
function nextMorning(now: Date) { const next = new Date(now); next.setHours(6, 0, 0, 0); if (next <= now) next.setDate(next.getDate() + 1); return next; }

const C = {
  bg: '#FFF9F7',
  paper: '#FFFFFF',
  rose: '#D88C9A',
  berry: '#A85F72',
  lavender: '#C9B8E8',
  lavenderSoft: '#F3EEFB',
  peach: '#F4B8A6',
  text: '#2E2A2B',
  muted: '#8C7F82',
  border: '#EFD8DC',
  roseSoft: '#FDE8EA',
  sage: '#8FB996',
  grayTile: '#D9D2D3',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  appShell: { flex: 1, backgroundColor: C.bg },
  screenArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  page: { flexGrow: 1, padding: 22, backgroundColor: C.bg },
  pageWithNav: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 120, backgroundColor: C.bg },
  centerContent: { justifyContent: 'center' },

  brandPill: { alignSelf: 'flex-start', backgroundColor: C.berry, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 20 },
  brandPillText: { color: '#fff', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  logo: { fontSize: 31, fontWeight: '900', letterSpacing: -1.3, color: C.text },
  logoHeart: { color: C.berry },
  hero: { fontSize: 38, lineHeight: 42, fontWeight: '900', letterSpacing: -1.5, color: C.text, marginTop: 8 },
  sectionTitle: { fontSize: 32, fontWeight: '900', color: C.text, letterSpacing: -1.1 },
  sub: { fontSize: 16, lineHeight: 24, color: C.muted, marginTop: 12, marginBottom: 22 },
  subCompact: { fontSize: 16, lineHeight: 24, color: '#7D686D', marginTop: 12 },
  muted: { fontSize: 14, color: C.muted, marginTop: 3 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5, color: C.berry },

  card: { backgroundColor: C.paper, borderRadius: 24, padding: 18, marginVertical: 20, borderWidth: 1, borderColor: C.border },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: C.berry },
  input: { marginTop: 7, fontSize: 17, fontWeight: '700', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, color: C.text },
  segment: { flexDirection: 'row', backgroundColor: '#F5E9EB', padding: 4, borderRadius: 16, marginTop: 20 },
  segmentButton: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 12 },
  segmentActive: { backgroundColor: C.paper },
  segmentText: { fontWeight: '800', color: C.muted },
  segmentTextActive: { color: C.berry },

  primaryButton: { backgroundColor: C.berry, minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryButton: { borderWidth: 1.5, borderColor: C.border, minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 14, backgroundColor: C.paper },
  secondaryButtonText: { fontSize: 15, fontWeight: '800', color: C.berry },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 16 },
  backText: { fontWeight: '800', fontSize: 16, color: C.berry },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  simpleHeader: { marginBottom: 2 },
  streakCard: { minWidth: 102, backgroundColor: C.paper, borderRadius: 26, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  streakNumber: { fontSize: 25, fontWeight: '900', color: C.berry, lineHeight: 28 },
  streakLabel: { fontSize: 12, color: C.muted, fontWeight: '800' },

  countdownBar: { marginTop: 18, marginBottom: 6, backgroundColor: '#FFFDFD', borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  currentTime: { fontSize: 18, fontWeight: '900', color: C.text, minWidth: 72 },
  countdownDivider: { height: 28, width: 1, backgroundColor: C.border, marginHorizontal: 13 },
  countdownLabel: { fontSize: 9, letterSpacing: 1.2, color: C.muted, fontWeight: '900' },
  countdownValue: { marginTop: 2, fontSize: 14, color: C.berry, fontWeight: '900' },

  heroCard: { marginTop: 18, borderRadius: 30, padding: 24, backgroundColor: C.roseSoft, borderWidth: 1.5, borderColor: '#F2C8CE' },
  cardHero: { fontSize: 29, lineHeight: 34, fontWeight: '900', color: C.text, marginTop: 10, letterSpacing: -1 },

  progressWrap: { marginTop: 27, flexDirection: 'row', justifyContent: 'space-between', position: 'relative' },
  progressRail: { position: 'absolute', left: 18, right: 18, top: 8, height: 3, borderRadius: 2, backgroundColor: '#EECED3' },
  progressStep: { width: '31%', alignItems: 'center' },
  progressDot: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#E7C4CA', marginBottom: 8 },
  progressDotActive: { backgroundColor: C.berry },
  progressLabel: { fontSize: 11, fontWeight: '800', color: '#8B7479', textAlign: 'center' },

  statsCard: { backgroundColor: C.paper, borderRadius: 27, padding: 20, marginTop: 14, borderWidth: 1.5, borderColor: C.border },
  statsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statsTitle: { fontSize: 22, fontWeight: '900', color: C.text, marginTop: 5 },
  statsMini: { fontSize: 12, color: C.muted, fontWeight: '800', backgroundColor: '#FAF0F2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statCompareRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  statPerson: { flex: 1, alignItems: 'center' },
  statName: { fontSize: 14, fontWeight: '900', color: C.text, maxWidth: 110 },
  statAverage: { fontSize: 31, fontWeight: '900', color: C.berry, marginTop: 3 },
  statCaption: { fontSize: 11, color: C.muted, fontWeight: '700' },
  statWins: { marginTop: 7, fontSize: 11, color: '#7D686D', fontWeight: '800' },
  vsPill: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.lavenderSoft, alignItems: 'center', justifyContent: 'center' },
  vsText: { color: '#8977A3', fontWeight: '900', fontSize: 12 },
  statsFoot: { textAlign: 'center', marginTop: 18, color: C.muted, fontSize: 11, fontWeight: '700' },

  actionCard: { backgroundColor: '#FFF6F3', borderRadius: 26, padding: 21, marginTop: 14, borderWidth: 1.5, borderColor: '#F2D6D1' },
  lavenderCard: { backgroundColor: C.lavenderSoft, borderColor: '#DED2F2' },
  actionStatus: { fontSize: 24, fontWeight: '900', color: C.text, marginTop: 8, letterSpacing: -0.6 },
  actionDetail: { fontSize: 15, lineHeight: 21, color: C.muted, marginTop: 7 },
  inviteCode: { fontSize: 44, fontWeight: '900', letterSpacing: 8, textAlign: 'center', marginVertical: 24, color: C.berry },
  refreshLink: { paddingVertical: 24, alignItems: 'center' },
  refreshText: { color: C.berry, fontWeight: '900', fontSize: 15 },

  waitingCard: { marginTop: 18, borderRadius: 28, padding: 24, backgroundColor: C.lavenderSoft, borderWidth: 1.5, borderColor: '#DDD0F0' },
  wordleTopCard: { marginTop: 18, borderRadius: 22, padding: 18, backgroundColor: C.roseSoft, borderWidth: 1, borderColor: '#F0D0D5' },
  wordleStatus: { fontSize: 24, fontWeight: '900', color: C.text, marginTop: 5 },
  wordleSub: { marginTop: 6, fontSize: 13, color: C.muted },
  board: { gap: 8, marginVertical: 22 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  tile: { width: 54, height: 54, borderWidth: 2, borderColor: C.grayTile, borderRadius: 10, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 23, fontWeight: '900', color: C.text },
  correct: { backgroundColor: C.sage, borderColor: C.sage },
  present: { backgroundColor: '#D8B86A', borderColor: '#D8B86A' },
  absent: { backgroundColor: '#8D8587', borderColor: '#8D8587' },
  guessInput: { minHeight: 56, borderRadius: 17, backgroundColor: C.paper, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 16, textAlign: 'center', fontSize: 18, fontWeight: '900', letterSpacing: 2, color: C.text },
  finishedNote: { backgroundColor: C.paper, borderRadius: 18, padding: 15, borderWidth: 1, borderColor: C.border },
  finishedNoteText: { textAlign: 'center', color: C.berry, fontWeight: '900' },

  profileCard: { marginTop: 18, alignItems: 'center', backgroundColor: C.paper, borderRadius: 28, padding: 24, borderWidth: 1.5, borderColor: C.border },
  avatarCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.roseSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.berry, fontWeight: '900', fontSize: 24 },
  profileName: { fontSize: 25, fontWeight: '900', color: C.text, marginTop: 12 },
  profileMeta: { fontSize: 13, color: C.muted, marginTop: 3 },
  pairedCard: { marginTop: 14, backgroundColor: C.lavenderSoft, borderRadius: 26, padding: 21, borderWidth: 1.5, borderColor: '#DED2F2' },
  partnerLine: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  partnerName: { fontSize: 26, fontWeight: '900', color: C.text },
  softHeart: { fontSize: 25, color: C.berry, marginLeft: 8 },
  pairedSub: { marginTop: 6, color: C.muted, fontSize: 14 },
  accountStatsRow: { flexDirection: 'row', gap: 9, marginTop: 14 },
  miniStat: { flex: 1, backgroundColor: C.paper, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  miniStatValue: { fontSize: 22, fontWeight: '900', color: C.berry },
  miniStatLabel: { marginTop: 4, fontSize: 10, color: C.muted, fontWeight: '800', textAlign: 'center' },

  wordEntry: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 28 },
  bigTile: { width: '18%', aspectRatio: .85, borderRadius: 13, borderWidth: 2, borderColor: C.border, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  bigTileFilled: { borderColor: C.berry, backgroundColor: '#FFF4F6' },
  bigTileText: { fontSize: 28, fontWeight: '900', color: C.text },
  hiddenInput: { opacity: .02, height: 5 },

  bottomNavWrap: { position: 'absolute', left: 18, right: 18, bottom: Platform.OS === 'ios' ? 12 : 10 },
  bottomNav: { height: 72, backgroundColor: '#FFFDFD', borderRadius: 24, borderWidth: 1.5, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 10, shadowColor: '#6D4D55', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIconBubble: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  navIconBubbleActive: { backgroundColor: C.roseSoft },
  navGlyph: { fontSize: 19, fontWeight: '900', color: '#A69599' },
  navGlyphActive: { color: C.berry },
  navLabel: { fontSize: 10, fontWeight: '800', color: '#A69599', marginTop: 2 },
  navLabelActive: { color: C.berry },
});