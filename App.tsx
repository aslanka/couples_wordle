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

  if (loading && !dashboard) return <Centered><ActivityIndicator size="large" /></Centered>;
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

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.headerRow}>
        <View><Text style={styles.logo}>Pairle</Text><Text style={styles.muted}>{prettyDate()}</Text></View>
        <View style={styles.streakPill}><Text style={styles.streakText}>🔥 {dashboard.streak ?? 0}</Text></View>
      </View>

      {waitingForPartner ? (
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>WAITING FOR YOUR PARTNER</Text>
          <Text style={styles.cardHero}>Invite code: {dashboard.inviteCode}</Text>
          <Text style={styles.sub}>Once they join, this screen becomes your permanent daily Pairle.</Text>
          <SecondaryButton title="Refresh" onPress={onRefresh} />
        </View>
      ) : (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>TODAY'S PAIRLE</Text>
            <Text style={styles.cardHero}>{dashboard.completed ? 'You both finished ❤️' : `You + ${dashboard.partnerName}`}</Text>
            <Text style={styles.sub}>{dashboard.completed ? 'Come back tomorrow for a fresh word.' : 'Make a word for each other. Solve whenever you are ready.'}</Text>
          </View>

          <ActionCard title={`Word for ${dashboard.partnerName}`} status={dashboard.myWordReady ? 'Sent ✓' : 'Not sent yet'} button={!dashboard.myWordReady ? 'Create word' : undefined} onPress={onSetWord} />
          <ActionCard title={`${dashboard.partnerName}'s word for you`} status={dashboard.partnerWordReady ? dashboard.myResult?.finished ? resultText(dashboard.myResult) : 'Ready 🟢' : `Waiting for ${dashboard.partnerName}…`} button={canPlay ? 'Play' : undefined} onPress={onPlay} />
        </>
      )}

      <SecondaryButton title="Refresh" onPress={onRefresh} />
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
      Alert.alert('Sent 💌', `${dashboard.partnerName} can now play today's word.`);
    } catch (e) { Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again'); }
    finally { setBusy(false); }
  }
  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Back onPress={onBack} />
      <Text style={styles.eyebrow}>SECRET WORD</Text>
      <Text style={styles.hero}>Pick a word for {dashboard.partnerName}.</Text>
      <Text style={styles.sub}>The answer stays in Supabase and is never sent to their app while they are solving.</Text>
      <WordTiles word={word} />
      <TextInput value={word} onChangeText={(v) => setWord(normalizeWord(v))} autoFocus maxLength={5} autoCapitalize="characters" autoCorrect={false} style={styles.hiddenInput} />
      <PrimaryButton title={busy ? 'Sending…' : 'Send today’s word'} onPress={save} disabled={busy || word.length !== 5} />
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
        Alert.alert(next.myResult.solved ? 'Nice 🎉' : 'Oof 😅', next.myResult.solved ? `Solved in ${next.myResult.guesses.length}/6.` : `The word was ${next.myResult.answer}.`);
      }
    } catch (e) { Alert.alert('Could not submit', e instanceof Error ? e.message : 'Try again'); }
    finally { setBusy(false); }
  }
  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Back onPress={onBack} />
      <Text style={styles.eyebrow}>MADE BY {dashboard.partnerName?.toUpperCase()}</Text>
      <Text style={styles.sectionTitle}>Today's Pairle</Text>
      <View style={styles.board}>{Array.from({ length: 6 }).map((_, r) => <GuessRow key={r} guess={guesses[r]} draft={r === guesses.length ? draft : ''} />)}</View>
      {!dashboard.myResult?.finished && <><TextInput value={draft} onChangeText={(v) => setDraft(normalizeWord(v))} maxLength={5} autoCapitalize="characters" autoCorrect={false} style={styles.guessInput} placeholder="TYPE YOUR GUESS" /><PrimaryButton title={busy ? 'Checking…' : 'Submit guess'} onPress={submit} disabled={busy || draft.length !== 5} /></>}
    </KeyboardAvoidingView>
  );
}

function GuessRow({ guess, draft }: { guess?: ScoredGuess; draft: string }) {
  const word = guess?.word ?? draft;
  return <View style={styles.row}>{Array.from({ length: 5 }).map((_, i) => <View key={i} style={[styles.tile, guess?.states[i] === 'correct' && styles.correct, guess?.states[i] === 'present' && styles.present, guess?.states[i] === 'absent' && styles.absent]}><Text style={[styles.tileText, guess && { color: '#fff' }]}>{word[i] ?? ''}</Text></View>)}</View>;
}

function WordTiles({ word }: { word: string }) { return <View style={styles.wordEntry}>{Array.from({ length: 5 }).map((_, i) => <View key={i} style={[styles.bigTile, word[i] && styles.bigTileFilled]}><Text style={styles.bigTileText}>{word[i] ?? ''}</Text></View>)}</View>; }
function ActionCard({ title, status, button, onPress }: { title: string; status: string; button?: string; onPress: () => void }) { return <View style={styles.actionCard}><Text style={styles.eyebrow}>{title.toUpperCase()}</Text><Text style={styles.actionStatus}>{status}</Text>{button && <PrimaryButton title={button} onPress={onPress} />}</View>; }
function Input(props: any) { const { label, ...rest } = props; return <View style={{ marginBottom: 16 }}><Text style={styles.label}>{label}</Text><TextInput {...rest} style={styles.input} /></View>; }
function Segment({ active, title, onPress }: { active: boolean; title: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentActive]}><Text style={[styles.segmentText, active && styles.segmentTextActive]}>{title}</Text></Pressable>; }
function PrimaryButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && { opacity: .35 }]}><Text style={styles.primaryButtonText}>{title}</Text></Pressable>; }
function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{title}</Text></Pressable>; }
function Back({ onPress }: { onPress: () => void }) { return <Pressable onPress={onPress} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>; }
function Centered({ children }: { children: React.ReactNode }) { return <SafeAreaView style={styles.center}>{children}</SafeAreaView>; }
function resultText(r?: Dashboard['myResult']) { if (!r) return 'Waiting'; return r.solved ? `Solved in ${r.guesses.length}/6` : r.finished ? `Missed · ${r.answer}` : 'Ready'; }
function prettyDate() { return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#F7F4EE'},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#F7F4EE'},page:{flexGrow:1,padding:22,backgroundColor:'#F7F4EE'},centerContent:{justifyContent:'center'},
  brandPill:{alignSelf:'flex-start',backgroundColor:'#171717',borderRadius:999,paddingHorizontal:12,paddingVertical:7,marginBottom:20},brandPillText:{color:'#fff',fontWeight:'900',letterSpacing:2,fontSize:12},logo:{fontSize:30,fontWeight:'900',letterSpacing:-1.3},hero:{fontSize:38,lineHeight:42,fontWeight:'900',letterSpacing:-1.5,color:'#171717',marginTop:8},sectionTitle:{fontSize:30,fontWeight:'900',marginVertical:12},sub:{fontSize:16,lineHeight:24,color:'#666158',marginTop:12,marginBottom:22},muted:{fontSize:13,color:'#827C72'},eyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.4,color:'#7A7469'},
  card:{backgroundColor:'#fff',borderRadius:24,padding:18,marginVertical:20,borderWidth:1,borderColor:'#E8E2D8'},label:{fontSize:11,fontWeight:'900',letterSpacing:1.2,color:'#787167'},input:{marginTop:7,fontSize:17,fontWeight:'700',paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#DED8CD'},segment:{flexDirection:'row',backgroundColor:'#EAE5DB',padding:4,borderRadius:16,marginTop:20},segmentButton:{flex:1,padding:12,alignItems:'center',borderRadius:12},segmentActive:{backgroundColor:'#fff'},segmentText:{fontWeight:'800',color:'#746E64'},segmentTextActive:{color:'#171717'},
  primaryButton:{backgroundColor:'#171717',minHeight:56,borderRadius:18,alignItems:'center',justifyContent:'center',marginTop:10},primaryButtonText:{color:'#fff',fontSize:16,fontWeight:'900'},secondaryButton:{borderWidth:1.5,borderColor:'#CCC4B7',minHeight:54,borderRadius:18,alignItems:'center',justifyContent:'center',marginTop:14},secondaryButtonText:{fontSize:15,fontWeight:'800'},back:{alignSelf:'flex-start',paddingVertical:8,paddingRight:16},backText:{fontWeight:'800',fontSize:16},
  headerRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},streakPill:{backgroundColor:'#fff',borderRadius:999,paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderColor:'#E8E2D8'},streakText:{fontWeight:'900'},heroCard:{marginTop:28,borderRadius:28,padding:22,backgroundColor:'#E9F1C9',borderWidth:1,borderColor:'#D8E4AB'},cardHero:{fontSize:28,lineHeight:32,fontWeight:'900',marginTop:8},actionCard:{backgroundColor:'#fff',borderRadius:24,padding:20,marginTop:14,borderWidth:1,borderColor:'#E8E2D8'},actionStatus:{fontSize:22,fontWeight:'900',marginTop:8},inviteCode:{fontSize:44,fontWeight:'900',letterSpacing:8,textAlign:'center',marginVertical:24},signOut:{padding:20},signOutText:{textAlign:'center',color:'#9A6F69',fontWeight:'700'},
  wordEntry:{flexDirection:'row',justifyContent:'space-between',marginVertical:28},bigTile:{width:'18%',aspectRatio:.85,borderRadius:13,borderWidth:2,borderColor:'#D8D1C5',backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},bigTileFilled:{borderColor:'#171717'},bigTileText:{fontSize:28,fontWeight:'900'},hiddenInput:{opacity:.02,height:5},board:{gap:7,marginVertical:16},row:{flexDirection:'row',justifyContent:'center',gap:7},tile:{width:52,height:52,borderWidth:2,borderColor:'#D8D1C5',borderRadius:8,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},tileText:{fontSize:23,fontWeight:'900'},correct:{backgroundColor:'#6AAA64',borderColor:'#6AAA64'},present:{backgroundColor:'#C9B458',borderColor:'#C9B458'},absent:{backgroundColor:'#787C7E',borderColor:'#787C7E'},guessInput:{minHeight:54,borderRadius:16,backgroundColor:'#fff',borderWidth:1.5,borderColor:'#D7D0C4',paddingHorizontal:16,textAlign:'center',fontSize:18,fontWeight:'900',letterSpacing:2},
});