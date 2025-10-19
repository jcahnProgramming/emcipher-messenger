import React, { useEffect, useRef, useState } from 'react';
import { Text, View, TextInput, Button, StyleSheet, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { Base64 } from 'js-base64';

// ---- tiny router ----
type Route =
  | { name: 'Home' }
  | { name: 'Join' }
  | { name: 'Chat'; convId: string; saltB64: string; profile: 'desktop' | 'mobile' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'Home' });

  if (route.name === 'Home') {
    return <HomeScreen goJoin={() => setRoute({ name: 'Join' })} />;
  }
  if (route.name === 'Join') {
    return (
      <JoinScreen
        goBack={() => setRoute({ name: 'Home' })}
        goChat={(p) => setRoute({ name: 'Chat', ...p })}
      />
    );
  }
  return <ChatScreen convId={route.convId} saltB64={route.saltB64} profile={route.profile} goBack={() => setRoute({ name: 'Home' })} />;
}

// ---- storage (seed only) ----
const KEY = 'emcipher.seed';
async function setSeedSecure(s: string) { await SecureStore.setItemAsync(KEY, s); }
async function getSeedSecure() { return SecureStore.getItemAsync(KEY); }

// ---- placeholder crypto (matches web/mobile placeholder) ----
function deriveKm(seed: string, convId: string, _saltB64: string, _profile: 'desktop'|'mobile'): string {
  const blob = `${seed}#${convId}`;
  return Base64.fromUint8Array(new TextEncoder().encode(blob)).slice(0, 44);
}
function deriveMsgKeyBase64(kmB64: string, counter: number): string {
  return Base64.fromUint8Array(new TextEncoder().encode(`${kmB64}:${counter}`));
}
function encryptB64(_kmsgB64: string, plaintext: string, aad: string) {
  const nonce = Math.random().toString(36).slice(2);
  return {
    nonce_b64: Base64.fromUint8Array(new TextEncoder().encode(nonce)),
    ct_b64: Base64.fromUint8Array(new TextEncoder().encode(`PT:${plaintext}|AAD:${aad}`))
  };
}
function decryptB64(_kmsgB64: string, _nonce_b64: string, ct_b64: string, _aad: string) {
  const dec = new TextDecoder().decode(Base64.toUint8Array(ct_b64));
  const m = dec.match(/^PT:(.*)\|AAD:/);
  return m ? m[1] : '(invalid placeholder ciphertext)';
}

// ---- relay client ----
const RELAY_URL = 'http://10.0.0.155:3001'; // your Mac’s LAN IP
type RelayMsg = { conv_id: string; msg_id: string; nonce_b64: string; aad: string; ciphertext: string; };

async function postMessage(convId: string, msg: RelayMsg) {
  const res = await fetch(`${RELAY_URL}/v1/conversations/${encodeURIComponent(convId)}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg)
  });
  if (!res.ok) throw new Error(`postMessage failed: ${res.status}`);
}
async function fetchMessages(convId: string): Promise<RelayMsg[]> {
  const res = await fetch(`${RELAY_URL}/v1/conversations/${encodeURIComponent(convId)}/messages`);
  if (!res.ok) throw new Error(`fetchMessages failed: ${res.status}`);
  const js = await res.json();
  return js?.msgs ?? [];
}
async function ackMessage(convId: string, msgId: string) {
  const res = await fetch(`${RELAY_URL}/v1/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(msgId)}/ack`, { method: 'POST' });
  if (!res.ok) throw new Error(`ackMessage failed: ${res.status}`);
}

// ---- screens ----
function HomeScreen({ goJoin }: { goJoin: () => void }) {
  const [seed, setSeedState] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => { (async () => { setLoaded(await getSeedSecure()); })(); }, []);

  return (
    <SafeAreaView style={styles.wrap}>
      <Text style={styles.title}>EmCipher Mobile (no-nav mode)</Text>

      <Text style={styles.label}>Master Seed (SecureStore)</Text>
      <TextInput
        value={seed}
        onChangeText={setSeedState}
        placeholder="Enter strong passphrase"
        secureTextEntry={true}
        style={styles.input}
      />
      <View style={{ height: 8 }} />
      <Button title="Save Seed" onPress={async () => {
        if (!seed) return Alert.alert('Seed required');
        await setSeedSecure(seed);
        setLoaded(await getSeedSecure());
        Alert.alert('Saved securely');
      }} />
      <View style={{ height: 8 }} />
      <Text>Loaded seed: {loaded ?? '(none)'}</Text>

      <View style={{ height: 24 }} />
      <Button title="Join Conversation (paste JSON)" onPress={goJoin} />
    </SafeAreaView>
  );
}

function JoinScreen({
  goBack, goChat
}: {
  goBack: () => void;
  goChat: (p: { convId: string; saltB64: string; profile: 'desktop'|'mobile' }) => void;
}) {
  const [text, setText] = useState('');

  const handleApply = () => {
    try {
      const parsed = JSON.parse(text) as { convId?: string; saltB64?: string; profile?: 'desktop'|'mobile' };
      if (!parsed?.convId || !parsed?.saltB64 || !parsed?.profile) throw new Error('Invalid payload');
      goChat({ convId: parsed.convId, saltB64: parsed.saltB64, profile: parsed.profile });
    } catch (e: any) {
      Alert.alert('Invalid JSON', e?.message ?? String(e));
    }
  };

  return (
    <SafeAreaView style={styles.wrap}>
      <Text style={styles.title}>Join Conversation</Text>
      <Text style={{ opacity: 0.7 }}>Paste JSON from the web app QR.</Text>
      <View style={{ height: 12 }} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder='{"convId":"...","saltB64":"...","profile":"mobile"}'
        multiline={true}
        style={[styles.input, { minHeight: 100 }]}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Apply" onPress={handleApply} />
        <View style={{ width: 8 }} />
        <Button title="Back" onPress={goBack} />
      </View>
    </SafeAreaView>
  );
}

function ChatScreen({
  convId, saltB64, profile, goBack
}: {
  convId: string; saltB64: string; profile: 'desktop'|'mobile'; goBack: () => void;
}) {
  const [counter, setCounter] = useState<number>(1);
  const [aad, setAad] = useState<string>('v=1');
  const [input, setInput] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [inbox, setInbox] = useState<RelayMsg[]>([]);
  const kmRef = useRef<string>('');

  useEffect(() => {
    (async () => {
      const s = await getSeedSecure();
      if (s) {
        kmRef.current = deriveKm(s, convId, saltB64, profile);
        pushLog('🔑 Derived KM (placeholder).');
      } else {
        pushLog('❌ No seed found — set it on Home first.');
      }
    })();
  }, [convId, saltB64, profile]);

  const pushLog = (m: string) => setLog(prev => [`${new Date().toLocaleTimeString()} ${m}`, ...prev]);

  const doEncryptAndSend = async () => {
    if (!kmRef.current) { pushLog('❌ No KM — set seed.'); return; }
    const kmsg = deriveMsgKeyBase64(kmRef.current, counter);
    const { nonce_b64, ct_b64 } = encryptB64(kmsg, input, aad);
    const msg: RelayMsg = {
      conv_id: convId,
      msg_id: `${Date.now()}`, // simple id for now
      nonce_b64,
      aad: Base64.fromUint8Array(new TextEncoder().encode(aad)),
      ciphertext: ct_b64
    };
    await postMessage(convId, msg);
    pushLog(`➡️ sent: ${input}`);
    setInput('');
    setCounter(c => c + 1);
  };

  const pollInboxOnce = async () => {
    const list = await fetchMessages(convId);
    setInbox(list);
    pushLog(`⬅️ fetched ${list.length} message(s)`);
  };

  const decryptFirst = async () => {
    if (!kmRef.current) { pushLog('❌ No KM — set seed.'); return; }
    if (!inbox.length) { pushLog('📭 Inbox empty'); return; }
    const m = inbox[0];
    const kmsg = deriveMsgKeyBase64(kmRef.current, counter);
    const aadUtf8 = new TextDecoder().decode(Base64.toUint8Array(m.aad));
    const pt = decryptB64(kmsg, m.nonce_b64, m.ciphertext, aadUtf8);
    pushLog(`🔓 decrypted: ${pt}`);
    await ackMessage(convId, m.msg_id);
    pushLog(`✅ ACKed ${m.msg_id}`);
    setInbox(inbox.slice(1));
  };

  return (
    <SafeAreaView style={styles.wrap}>
      <Text style={styles.title}>Chat</Text>
      <Text style={{ opacity: 0.7 }}>convId: <Text style={styles.mono}>{convId}</Text></Text>
      <Text style={{ opacity: 0.7 }}>saltB64: <Text style={styles.mono}>{saltB64}</Text></Text>
      <Text style={{ opacity: 0.7 }}>profile: <Text style={styles.mono}>{profile}</Text></Text>

      <View style={{ height: 10 }} />
      <Text style={styles.label}>AAD</Text>
      <TextInput value={aad} onChangeText={setAad} style={styles.input} />

      <View style={{ height: 10 }} />
      <Text style={styles.label}>Message</Text>
      <TextInput value={input} onChangeText={setInput} style={styles.input} placeholder="Type..." />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <Button title="Encrypt + Send" onPress={doEncryptAndSend} />
        <Button title="Fetch Inbox" onPress={pollInboxOnce} />
        <Button title="Decrypt + ACK" onPress={decryptFirst} />
        <Button title="Back" onPress={goBack} />
      </View>

      <View style={{ height: 16 }} />
      <Text style={styles.label}>Event Log</Text>
      <FlatList
        style={{ flex: 1 }}
        data={log}
        keyExtractor={(i, idx) => idx.toString()}
        renderItem={({ item }) => <Text style={styles.mono}>{item}</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  label: { opacity: 0.7 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 10 },
  mono: { fontFamily: 'Menlo', fontSize: 12 }
});
