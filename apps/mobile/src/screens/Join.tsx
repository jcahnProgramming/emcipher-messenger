import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JoinPayload } from '../types';

type RootStackParamList = {
  Home: undefined;
  Join: undefined;
  Chat: { convId: string; saltB64: string; profile: 'desktop'|'mobile' };
};

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;

export default function Join({ navigation }: Props) {
  const [text, setText] = useState('');

  const handleApply = () => {
    try {
      const parsed = JSON.parse(text) as JoinPayload;
      if (!parsed?.convId || !parsed?.saltB64 || !parsed?.profile) throw new Error('Invalid payload');
      navigation.replace('Chat', { convId: parsed.convId, saltB64: parsed.saltB64, profile: parsed.profile });
    } catch (e: any) {
      Alert.alert('Invalid JSON', e?.message ?? String(e));
    }
  };

  return (
    <SafeAreaView style={styles.wrap}>
      <Text style={styles.title}>Join Conversation</Text>
      <Text style={{ opacity: 0.7 }}>Paste JSON from the web app.</Text>
      <View style={{ height: 12 }} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder='{"convId":"...","saltB64":"...","profile":"mobile"}'
        multiline
        style={styles.input}
      />
      <Button title="Apply JSON" onPress={handleApply} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 10, minHeight: 100 }
});
