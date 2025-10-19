import React, { useEffect, useRef, useState } from 'react';
import {
  Text, View, TextInput, Button, StyleSheet, FlatList, Alert,
  ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { Base64 } from 'js-base64';
import { CameraView, useCameraPermissions } from 'expo-camera';

/* ------------ tiny router ------------ */
type Route =
  | { name: 'Home' }
  | { name: 'Join' }
  | { name: 'Chat'; convId: string; saltB64: string; profile: 'desktop' | 'mobile' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'Home' });

  const renderScreen = () => {
    if (route.name === 'Home') {
      return (
        <>
          <Header title="EmCipher Mobile" subtitle="Secure seed & conversation join" />
          <HomeScreen goJoin={() => setRoute({ name: 'Join' })} />
        </>
      );
    }
    if (route.name === 'Join') {
      return (
        <>
          <Header title="Join Conversation" subtitle="Scan QR or paste JSON" onBack={() => setRoute({ name: 'Home' })} />
          <JoinScreen
            goBack={() => setRoute({ name: 'Home' })}
            goChat={(p) => setRoute({ name: 'Chat', ...p })}
          />
        </>
      );
    }
    return (
      <>
        <Header title="Chat" subtitle="Relay demo (placeholder crypto)" onBack={() => setRoute({ name: 'Home' })} />
        <ChatScreen
          convId={route.convId}
          saltB64={route.saltB64}
          profile={route.profile}
          goBack={() => setRoute({ name: 'Home' })}
        />
      </>
    );
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {renderScreen()}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* ------------ UI atoms ------------ */
function Header({
  title, subtitle, onBack
}: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {onBack ? (
          <View style={{ marginRight: 12 }}>
            <Button title="Back" onPress={onBack} />
          </View>
        ) : <View style={{ width: 64 }} /> }
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={{ width: 64 }} />
      </View>
    </View>
  );
}

/* ------------ storage (seed only) ------------ */
const KEY = 'emcipher.seed';
async function setSeedSecure(s: string) { await SecureStore.setItemAsync(KEY, s); }
async function getSeedSecure() { return SecureStore.getItemAsync(KEY); }

/* ------------ placeholder crypto ------------ */
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

/* ------------ relay client ------------ */
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

/* ------------ screens ------------ */
function HomeScreen({ goJoin }: { goJoin: () => void }) {
  const [seed, setSeedState] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => { (async () => { setLoaded(await getSeedSecure()); })(); }, []);

  return (
    <View style={styles.card}>
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
      <View style={{ height: 12 }} />
      <Text style={styles.muted}>Loaded seed: {loaded ?? '(none)'} </Text>

      <View style={{ height: 24 }} />
      <Button title="Join Conversation (scan or paste)" onPress={goJoin} />
    </View>
  );
}

function JoinScreen({
  goBack, goChat
}: {
  goBack: () => void;
  goChat: (p: { convId: string; saltB64: string; profile: 'desktop'|'mobile' }) => void;
}) {
  const [text, setText] = useState('');
  const [scannerVisible, setScannerVisible] = useState<boolean>(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    // lazy request when opening scanner
    (async () => {
      if (scannerVisible && (!permission || permission.granted === false)) {
        await requestPermission();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerVisible]);

  const applyJSON = (json: string) => {
    try {
      const parsed = JSON.parse(json) as { convId?: string; saltB64?: string; profile?: 'desktop'|'mobile' };
      if (!parsed?.convId || !parsed?.saltB64 || !parsed?.profile) throw new Error('Invalid payload');
      goChat({ convId: parsed.convId, saltB64: parsed.saltB64, profile: parsed.profile });
    } catch (e: any) {
      Alert.alert('Invalid JSON', e?.message ?? String(e));
    }
  };

  const handleScan = ({ data }: { data: string }) => {
    setScannerVisible(false); // close camera immediately to avoid double-fires
    setText(data);
    applyJSON(data);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Scan a QR from web, or paste JSON</Text>

      {/* Scanner toggle */}
      <View style={styles.row}>
        <Button
          title={scannerVisible ? 'Close Scanner' : 'Open Scanner'}
          onPress={() => setScannerVisible(v => !v)}
        />
        <View style={{ width: 8 }} />
        <Button title="Back" onPress={goBack} />
      </View>

      {/* Minimal, safe CameraView */}
      {scannerVisible && permission?.granted === true && (
        <View style={styles.cameraBox}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            /* critical: pass real booleans, not strings */
            active={true}
            onBarcodeScanned={handleScan}
          />
        </View>
      )}

      {scannerVisible && permission && permission.granted === false && (
        <View style={{ marginTop: 8 }}>
          <Text>Camera permission not granted.</Text>
          <View style={{ height: 8 }} />
          <Button title="Grant Permission" onPress={requestPermission} />
        </View>
      )}

      <View style={{ height: 12 }} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder='{"convId":"...","saltB64":"...","profile":"mobile"}'
        multiline={true}
        style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
      />
      <View style={{ height: 8 }} />
      <Button title="Apply JSON" onPress={() => applyJSON(text)} />
    </View>
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
      msg_id: `${Date.now()}`,
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
    <View style={styles.card}>
      <Text style={styles.kv}>convId: <Text style={styles.mono}>{convId}</Text></Text>
      <Text style={styles.kv}>saltB64: <Text style={styles.mono}>{saltB64}</Text></Text>
      <Text style={styles.kv}>profile: <Text style={styles.mono}>{profile}</Text></Text>

      <Text style={styles.label}>AAD</Text>
      <TextInput value={aad} onChangeText={setAad} style={styles.input} />

      <Text style={styles.label}>Message</Text>
      <TextInput
        value={input}
        onChangeText={setInput}
        style={styles.input}
        placeholder="Type…"
      />

      <View style={styles.rowWrap}>
        <Button title="Encrypt + Send" onPress={doEncryptAndSend} />
        <Button title="Fetch Inbox" onPress={pollInboxOnce} />
        <Button title="Decrypt + ACK" onPress={decryptFirst} />
        <Button title="Back" onPress={goBack} />
      </View>

      <Text style={[styles.label, { marginTop: 12 }]}>Event Log</Text>
      <FlatList
        style={{ maxHeight: 240 }}
        data={log}
        keyExtractor={(i, idx) => idx.toString()}
        renderItem={({ item }) => <Text style={styles.mono}>{item}</Text>}
      />
    </View>
  );
}

/* ------------ styles ------------ */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fb' },
  scrollContent: { paddingBottom: 24 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8ef'
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  card: {
    margin: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ececf3'
  },
  label: { fontSize: 12, color: '#666' },
  muted: { fontSize: 12, color: '#8a8a99' },
  kv: { fontSize: 12, color: '#666', marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#d9d9e3', borderRadius: 10,
    padding: 10, backgroundColor: '#fafbfe'
  },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  cameraBox: {
    height: 260, marginTop: 12, borderRadius: 14, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#ddd'
  },
  mono: { fontFamily: 'Menlo', fontSize: 12 }
});
