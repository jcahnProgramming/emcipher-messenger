import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Base64 } from "js-base64";
import { v4 as uuidv4 } from "uuid";
import { CryptoBridge } from "../src/crypto"; // relative import to web bridge

// Dynamically import QRCode to avoid SSR issues
const QRCode = dynamic(() => import("qrcode.react").then(m => m.default || m), { ssr: false });

// --- simple relay client ---
const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL || "http://localhost:3001";

type RelayMsg = {
  conv_id: string;
  msg_id: string;
  nonce_b64: string;
  aad: string;
  ciphertext: string;
};

async function postMessage(convId: string, msg: RelayMsg) {
  const res = await fetch(`${RELAY_URL}/v1/conversations/${encodeURIComponent(convId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
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
  const res = await fetch(
    `${RELAY_URL}/v1/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(msgId)}/ack`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`ackMessage failed: ${res.status}`);
}

// safe random 16 bytes on client
function random16B64(): string {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const u = new Uint8Array(16);
    window.crypto.getRandomValues(u);
    return Base64.fromUint8Array(u);
  }
  const u = new Uint8Array(16);
  for (let i = 0; i < 16; i++) u[i] = Math.floor(Math.random() * 256);
  return Base64.fromUint8Array(u);
}

export default function Home() {
  // conversation bootstrap (initialized in useEffect for SSR-safety)
  const [seed, setSeed] = useState("");
  const [convId, setConvId] = useState<string>("");
  const [saltB64, setSaltB64] = useState<string>("");
  const profile = "desktop" as const;

  // crypto / message state
  const [aad, setAad] = useState("v=1");
  const [counter, setCounter] = useState(1);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [inbox, setInbox] = useState<RelayMsg[]>([]);
  const kmRef = useRef<string>("");

  // status flags
  const [wasmReady, setWasmReady] = useState(false);
  const [kmDerived, setKmDerived] = useState(false);

  // init conv/salt on client only
  useEffect(() => {
    if (!convId) setConvId(uuidv4());
    if (!saltB64) setSaltB64(random16B64());
  }, [convId, saltB64]);

  const joinPayload = useMemo(
    () => (convId && saltB64 ? { convId, saltB64, profile: "mobile" as const } : null),
    [convId, saltB64]
  );

  useEffect(() => {
    (async () => {
      try {
        await CryptoBridge.init(); // initialize WASM
        setWasmReady(true);
        pushLog("✅ WASM initialized.");
      } catch (err: any) {
        setWasmReady(false);
        pushLog(`❌ WASM init failed: ${err?.message ?? String(err)}`);
        // Also surface to console for devs
        // eslint-disable-next-line no-console
        console.error("WASM init error:", err);
      }
    })();
  }, []);

  const pushLog = (m: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${m}`, ...prev]);

  const deriveKm = () => {
    try {
      if (!seed) {
        pushLog("❌ Seed required (enter a seed above).");
        return;
      }
      if (!convId || !saltB64) {
        pushLog("❌ ConvId/salt not ready yet (wait a moment).");
        return;
      }
      if (!wasmReady) {
        pushLog("⏳ WASM not ready yet.");
        return;
      }
      kmRef.current = CryptoBridge.deriveKm(seed, convId, saltB64, profile);
      setKmDerived(true);
      pushLog("🔑 Derived KM.");
    } catch (err: any) {
      setKmDerived(false);
      pushLog(`❌ Derive KM error: ${err?.message ?? String(err)}`);
      // eslint-disable-next-line no-console
      console.error("deriveKm error:", err);
    }
  };

  const doEncryptAndSend = async () => {
    try {
      if (!kmRef.current) return pushLog("❌ Derive KM first");
      if (!input) return pushLog("❌ Enter a message");

      const kmsg = CryptoBridge.deriveMsgKeyBase64(kmRef.current, counter);
      const { nonce_b64, ct_b64 } = CryptoBridge.encryptB64(kmsg, input, aad);

      const msg: RelayMsg = {
        conv_id: convId,
        msg_id: uuidv4(),
        nonce_b64,
        aad: Base64.fromUint8Array(new TextEncoder().encode(aad)),
        ciphertext: ct_b64,
      };
      await postMessage(convId, msg);
      pushLog(`➡️ sent: ${input}`);
      setInput("");
      setCounter((c) => c + 1);
    } catch (err: any) {
      pushLog(`❌ Send error: ${err?.message ?? String(err)}`);
      // eslint-disable-next-line no-console
      console.error("send error:", err);
    }
  };

  const pollInboxOnce = async () => {
    try {
      const list = await fetchMessages(convId);
      setInbox(list);
      pushLog(`⬅️ fetched ${list.length} message(s)`);
    } catch (err: any) {
      pushLog(`❌ Fetch error: ${err?.message ?? String(err)}`);
      // eslint-disable-next-line no-console
      console.error("fetch error:", err);
    }
  };

  const decryptFirst = async () => {
    try {
      if (!kmRef.current) return pushLog("❌ Derive KM first");
      if (!inbox.length) return pushLog("📭 Inbox empty");
      const m = inbox[0];
      const kmsg = CryptoBridge.deriveMsgKeyBase64(kmRef.current, counter);
      const aadUtf8 = new TextDecoder().decode(Base64.toUint8Array(m.aad));
      const pt = CryptoBridge.decryptB64(kmsg, m.nonce_b64, m.ciphertext, aadUtf8);
      pushLog(`🔓 decrypted: ${pt}`);
      await ackMessage(convId, m.msg_id);
      pushLog(`✅ ACKed ${m.msg_id}`);
      setInbox(inbox.slice(1));
    } catch (err: any) {
      pushLog(`❌ Decrypt error: ${err?.message ?? String(err)}`);
      // eslint-disable-next-line no-console
      console.error("decrypt error:", err);
    }
  };

  const regenerateConv = () => {
    setConvId(uuidv4());
    setSaltB64(random16B64());
    setCounter(1);
    kmRef.current = "";
    setKmDerived(false);
    pushLog("♻️ New conv & salt generated. Re-derive KM.");
  };

  const deriveDisabled = !wasmReady || !seed || !convId || !saltB64;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={{ margin: 0 }}>EmCipher Web (WASM)</h2>
        <p style={{ opacity: 0.7, marginTop: 6 }}>
          Uses Rust/WASM via the shared crypto bridge.
        </p>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
          <Badge label={`WASM: ${wasmReady ? "ready" : "loading…"}`} ok={wasmReady} />
          <Badge label={`KM: ${kmDerived ? "derived" : "not derived"}`} ok={kmDerived} />
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Seed</label>
          <input
            type="password"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Enter strong passphrase"
            style={styles.input}
          />
        </div>

        <div style={styles.rowWrap}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <label style={styles.label}>convId</label>
            <div style={styles.kv}>{convId || "(generating…)"}</div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <label style={styles.label}>saltB64</label>
            <div style={styles.kv}>{saltB64 || "(generating…)"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button onClick={deriveKm} disabled={deriveDisabled}>
            {deriveDisabled ? "Derive KM (fill seed + wait)" : "Derive KM"}
          </button>
          <button onClick={regenerateConv}>Regenerate conv/salt</button>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Join from Mobile</h3>
        <p className="muted" style={{ marginTop: 4 }}>
          Scan this QR (Join → Open Scanner) or paste JSON in the mobile app.
        </p>

        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <div>
            {joinPayload ? <QRCode value={JSON.stringify(joinPayload)} size={160} /> : <div>Generating…</div>}
          </div>
          <pre style={styles.pre}>{JSON.stringify(joinPayload, null, 2)}</pre>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Encrypt / Relay / Decrypt</h3>

        <div style={styles.row}>
          <label style={styles.label}>AAD</label>
          <input value={aad} onChange={(e) => setAad(e.target.value)} style={styles.input} />
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Message</label>
          <input value={input} onChange={(e) => setInput(e.target.value)} style={styles.input} placeholder="Type…" />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button onClick={doEncryptAndSend}>Encrypt + Send</button>
          <button onClick={pollInboxOnce}>Fetch Inbox</button>
          <button onClick={decryptFirst}>Decrypt + ACK</button>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Event Log</h3>
        <ul style={{ marginTop: 8 }}>
          {log.map((l, i) => (
            <li key={i} style={{ fontFamily: "Menlo, monospace", fontSize: 12 }}>
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* --- tiny Badge component --- */
function Badge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        padding: "4px 8px",
        borderRadius: 999,
        background: ok ? "#e7f8ef" : "#fff6e1",
        border: `1px solid ${ok ? "#b9ebd0" : "#ffe0a3"}`,
        color: ok ? "#0f7a42" : "#9a6a00",
      }}
    >
      {label}
    </span>
  );
}

// --- inline styles ---
const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1000,
    margin: "24px auto",
    padding: "0 16px",
    display: "grid",
    gap: 16,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    background: "#fff",
    border: "1px solid #ececf3",
    boxShadow: "0 6px 20px rgba(0,0,0,0.03)",
  },
  row: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center", marginTop: 8 },
  rowWrap: { display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 },
  label: { fontSize: 12, color: "#666" },
  input: {
    border: "1px solid #d9d9e3",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#fafbfe",
  },
  kv: {
    fontFamily: "Menlo, monospace",
    fontSize: 12,
    border: "1px dashed #e2e2ea",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#fbfbff",
    wordBreak: "break-all",
  },
  pre: {
    margin: 0,
    padding: 8,
    border: "1px dashed #e2e2ea",
    borderRadius: 8,
    background: "#fbfbff",
    fontSize: 12,
  },
};
