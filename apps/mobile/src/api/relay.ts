// Minimal relay client for RN. For Android emulator, replace localhost with 10.0.2.2.
const RELAY_URL = 'http://10.0.0.155:3001';


export type RelayMsg = {
  conv_id: string;
  msg_id: string;
  nonce_b64: string;
  aad: string; // base64
  ciphertext: string;
};

export async function postMessage(convId: string, msg: RelayMsg) {
  const res = await fetch(`${RELAY_URL}/v1/conversations/${encodeURIComponent(convId)}/messages`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(msg)
  });
  if (!res.ok) throw new Error(`postMessage failed: ${res.status}`);
}

export async function fetchMessages(convId: string): Promise<RelayMsg[]> {
  const res = await fetch(`${RELAY_URL}/v1/conversations/${encodeURIComponent(convId)}/messages`);
  if (!res.ok) throw new Error(`fetchMessages failed: ${res.status}`);
  const js = await res.json();
  return js?.msgs ?? [];
}

export async function ackMessage(convId: string, msgId: string) {
  const res = await fetch(
    `${RELAY_URL}/v1/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(msgId)}/ack`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error(`ackMessage failed: ${res.status}`);
}
