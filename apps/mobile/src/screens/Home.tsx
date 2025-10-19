import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getSeed, setSeed } from '../storage/secure';

type RootStackParamList = {
  Home: undefined;
  Join: undefined;
  Chat: { convId: string; saltB64: string; profile: 'desktop'|'mobile' };
};

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function Home({ navigation }: Props) {
  const [seed, setSeedState] = useState('');

  useEffect(() => {
    (async () => {
      const s = await getSeed();
      if (s) setSeedState(s);
    })();
  }, []);

  return (
    <SafeAreaView style={styles.wrap}>
      <Text style={styles.title}>EmCipher Mobile</Text>
      <Text style={styles.label}>Master Seed (kept in SecureStore)</Text>
      <TextInput
        value={seed}
        onChangeText={setSeedState}
        placeholder="Enter strong passphrase"
        secureTextEntry
        style={styles.input}
      />
      <View style={{height:8}}/>
      <Button title="Save Seed" onPress={async () => {
        if (!seed) return Alert.alert('Seed required');
        await setSeed(seed);
        Alert.alert('Saved securely');
      }} />
      <View style={{height:24}}/>
      <Button title="Join Conversation (QR or Paste)" onPress={() => navigation.navigate('Join')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex:1, padding:16, gap:16, backgroundColor:'#fff' },
  title: { fontSize:24, fontWeight:'700' },
  label: { opacity:0.7 },
  input: { borderWidth:1, borderColor:'#ccc', borderRadius:10, padding:10 }
});
