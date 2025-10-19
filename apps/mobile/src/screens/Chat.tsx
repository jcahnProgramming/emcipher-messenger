import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getSeed } from '../storage/secure';
import { postMessage, fetchMessages, ackMessage, RelayMsg } from '../api/relay';
import { v4 as uuidv4 } from 'uuid';
import { deriveKm, deriveMsgKeyBase64, encryptB64, decryptB64 } from '../crypto/placeholder';
import { Base64 } from 'js-base64';

type RootStackParamList = {
  Chat: { convId: string; saltB64: string; profile: 'desktop'|'mobile' };
};

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function Chat({ route }: Props) {
  const { convId, saltB64, profile } = route.params;
  const [counter, setCounter] = useState<number>(1);
  const [aad, setAad] = useState<string>('v=1');
  const [input, setInput] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [inbox, setInbox] = useState<RelayMsg[]>([]);
  const kmRef = useRef<string>('');

  useEffect(() => {
    (async () => {
      const s = await getSeed();
      if (s) {
        kmRef.current = deriveKm(s, convId, saltB64, profile);
        pushLog('🔑 Derived KM (placeholder).');
      } else {
        pushLog('❌ No seed found — set it on Home first.');
      }
    })();
  }, [convId, saltB64, profile]);

  const pushLog = (m: string) =>
    setLog(prev => [`${new Date().toLocaleTimeString()} ${m}`, ...prev]);

  const doEncryptAndSend = async () => {
    if (!kmRef.current) { pushLog('❌ No KM — set seed.'); return; }
    const kmsg = deriveMsgKeyBase64(kmRef.current, counter);
    const { nonce_b64, ct_b64 } = encryptB64(kmsg, input, aad);
    const msg: RelayMsg = {
      conv_id: convId,
      msg_id: uuidv4(),
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
      <Text style={{opacity:0.7}}>convId: <Text style={styles.mono}>{convId}</Text></Text>
      <Text style={{opacity:0.7}}>saltB64: <Text style={styles.mono}>{saltB64}</Text></Text>
      <Text style={{opacity:0.7}}>profile: <Text style={styles.mono}>{profile}</Text></Text>

      <View style={{height:10}}/>
      <Text style={styles.label}>AAD</Text>
      <TextInput value={aad} onChangeText={setAad} style={styles.input}/>

      <View style={{height:10}}/>
      <Text style={styles.label}>Message</Text>
      <TextInput value={input} onChangeText={setInput} style={styles.input} placeholder="Type..." />

      <View style={{flexDirection:'row', gap:8, marginTop:8, flexWrap:'wrap'}}>
        <Button title="Encrypt + Send" onPress={doEncryptAndSend} />
        <Button title="Fetch Inbox" onPress={pollInboxOnce} />
        <Button title="Decrypt + ACK" onPress={decryptFirst} />
      </View>

      <View style={{height:16}}/>
      <Text style={styles.label}>Event Log</Text>
      <FlatList
        style={{flex:1}}
        data={log}
        keyExtractor={(i, idx) => idx.toString()}
        renderItem={({item}) => <Text style={styles.mono}>{item}</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex:1, padding:16, gap:12, backgroundColor:'#fff' },
  title: { fontSize:22, fontWeight:'700' },
  label: { opacity:0.7 },
  input: { borderWidth:1, borderColor:'#ccc', borderRadius:10, padding:10 },
  mono: { fontFamily: 'Menlo', fontSize:12 }
});
