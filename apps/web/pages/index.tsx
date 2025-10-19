import { useEffect, useRef, useState } from "react";

type Wasm = {
  default?: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<any>;
  derive_master_key_b64(
    seed: string,
    salt_b64: string,
    conv_id: string,
    profile: string
  ): string;
  derive_message_key_b64(km_b64: string, counter: number): string;
  encrypt_aead_b64(
    k_b64: string,
    pt: string,
    aad: string
  ): { nonce_b64: string; ct_b64: string };
  decrypt_aead_b64(
    k_b64: string,
    nonce_b64: string,
    ct_b64: string,
    aad: string
  ): string;
};

export default function Home() {
  const wasmRef = useRef<Wasm | null>(null);
  const [ready, setReady] = useState(false);

  // crypto params
  const [seed, setSeed] = useState("correct horse battery staple");
  const [convId, setConvId] = useState("demo-conv-uuid");
  const [saltB64, setSaltB64] = useState(() =>
    btoa(String.fromCharCode(...Array(16).fill(7)))
  );
  const [profile, setProfile] = useState<"desktop" | "mobile">("desktop");
  const [counter, setCounter] = useState<number>(1);
  const [aad, setAad] = useState("conv=demo;msg=1;v=1");

  // derived keys
  const [kmB64, setKmB64] = useState("");
  const [kmsgB64, setKmsgB64] = useState("");

  // message state
  const [message, setMessage] = useState("Hello from the browser!");
  const [nonceB64, setNonceB64] = useState("");
  const [ctB64, setCtB64] = useState("");
  const [ptOut, setPtOut] = useState("");

  // relay tracking
  const [postedMsgId, setPostedMsgId] = useState<string>("");
  const [fetchedMsgId, setFetchedMsgId] = useState<string>("");

  // ui
  const [status, setStatus] = useState("");

  // Load WASM glue JS from /public using a URL import (bypasses webpack)
  useEffect(() => {
    (async () => {
      try {
        // 👇 webpackIgnore tells Next not to bundle this; it's served from /public
        const mod = (await import(
          /* webpackIgnore: true */ "/wasm/emcipher/emcipher_wasm.js"
        )) as unknown as Wasm;

        // For wasm-pack --target web, call init with the .wasm URL explicitly
        if (typeof mod.default === "function") {
          await mod.default("/wasm/emcipher/emcipher_wasm_bg.wasm");
        }

        wasmRef.current = mod as Wasm;
        setReady(true);
      } catch (e) {
        console.error(e);
        setStatus("Failed to load WASM. From apps/web run: npm run wasm");
      }
    })();
  }, []);

  // --- crypto helpers ---

  const derive = () => {
    if (!wasmRef.current) return;
    const km = wasmRef.current!.derive_master_key_b64(
      seed,
      saltB64,
      convId,
      profile
    );
    setKmB64(km);
    const kmsg = wasmRef.current!.derive_message_key_b64(km, counter);
    setKmsgB64(kmsg);
    setStatus("Derived KM + per-message key.");
  };

  const encrypt = () => {
    if (!wasmRef.current) return;
    const { nonce_b64, ct_b64 } = wasmRef.current!.encrypt_aead_b64(
      kmsgB64,
      message,
      aad
    );
    setNonceB64(nonce_b64);
    setCtB64(ct_b64);
    setStatus("Encrypted.");
  };

  const decrypt = async () => {
    if (!wasmRef.current) return;
    const pt = wasmRef.current!.decrypt_aead_b64(
      kmsgB64,
      nonceB64,
      ctB64,
      aad
    );
    setPtOut(pt);
    setStatus("Decrypted.");

    if (fetchedMsgId) {
      setStatus("Decrypted. Sending ACK…");
      await ackMessage(fetchedMsgId);
      setFetchedMsgId("");
      setStatus("ACK sent (deleted from relay).");
    }
  };

  // --- relay helpers ---

  const postToRelay = async () => {
    if (!nonceB64 || !ctB64) {
      setStatus("Encrypt first before posting.");
      return;
    }
    setStatus("Posting to relay…");
    const msgId = `${Date.now()}`; // TODO: switch to UUID
    const body = {
      conv_id: convId,
      msg_id: msgId,
      nonce_b64: nonceB64,
      aad: btoa(aad),
      ciphertext: ctB64,
    };
    await fetch(
      `http://localhost:3001/v1/conversations/${encodeURIComponent(
        convId
      )}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    setPostedMsgId(msgId);
    setStatus(`Posted msg_id=${msgId}`);
  };

  const fetchFromRelay = async () => {
    setStatus("Fetching from relay…");
    const res = await fetch(
      `http://localhost:3001/v1/conversations/${encodeURIComponent(
        convId
      )}/messages`
    );
    const data = await res.json();
    const list = (data?.msgs ?? []) as Array<{
      conv_id: string;
      msg_id: string;
      nonce_b64: string;
      aad: string; // base64
      ciphertext: string;
    }>;
    setStatus(`Fetched ${list.length} message(s).`);

    if (list.length) {
      const m = list[0];
      setFetchedMsgId(m.msg_id);
      setCtB64(m.ciphertext);
      setNonceB64(m.nonce_b64);
      setAad(atob(m.aad));
      setStatus(`Loaded msg_id=${m.msg_id}. Click Decrypt to view and ACK.`);
    }
  };

  const ackMessage = async (msgId: string) => {
    await fetch(
      `http://localhost:3001/v1/conversations/${encodeURIComponent(
        convId
      )}/messages/${encodeURIComponent(msgId)}/ack`,
      { method: "POST" }
    );
  };

  // --- ui ---

  return (
    <main style={{ maxWidth: 820, margin: "40px auto", fontFamily: "ui-sans-serif" }}>
      <h1>EmCipher Browser Playground</h1>
      <p style={{ opacity: 0.8 }}>
        Ensure relay is on <code>localhost:3001</code> and you ran{" "}
        <code>npm run wasm</code> from <code>apps/web</code>.
      </p>
      <p>
        <b>Status:</b> {ready ? "WASM ready. " : "Loading WASM… "} {status}
      </p>

      <section style={{ display: "grid", gap: 12, marginTop: 24 }}>
        <label>
          Seed
          <br />
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Conversation ID
          <br />
          <input
            value={convId}
            onChange={(e) => setConvId(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Salt (base64, 16 bytes)
          <br />
          <input
            value={saltB64}
            onChange={(e) => setSaltB64(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Profile&nbsp;
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as "desktop" | "mobile")}
          >
            <option value="desktop">desktop</option>
            <option value="mobile">mobile</option>
          </select>
        </label>
        <label>
          Message Counter
          <br />
          <input
            type="number"
            value={counter}
            onChange={(e) =>
              setCounter(parseInt(e.target.value || "0", 10))
            }
          />
        </label>
        <label>
          AAD
          <br />
          <input
            value={aad}
            onChange={(e) => setAad(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Message
          <br />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ width: "100%" }}
            rows={3}
          />
        </label>
      </section>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={derive}>1) Derive keys</button>
        <button onClick={encrypt}>2) Encrypt</button>
        <button onClick={postToRelay}>3) POST → Relay</button>
        <button onClick={fetchFromRelay}>4) Fetch</button>
        <button onClick={decrypt}>5) Decrypt + ACK</button>
      </div>

      <section style={{ marginTop: 20 }}>
        <h3>Derived</h3>
        <div>
          KM (b64): <code style={{ wordBreak: "break-all" }}>{kmB64}</code>
        </div>
        <div>
          K_msg (b64):{" "}
          <code style={{ wordBreak: "break-all" }}>{kmsgB64}</code>
        </div>
        <div>
          Nonce (b64):{" "}
          <code style={{ wordBreak: "break-all" }}>{nonceB64}</code>
        </div>
        <div>
          Ciphertext (b64):{" "}
          <code style={{ wordBreak: "break-all" }}>{ctB64}</code>
        </div>
        <div>
          Decrypted plaintext: <code>{ptOut}</code>
        </div>
        <div>
          Posted msg_id: <code>{postedMsgId || "—"}</code>
        </div>
        <div>
          Fetched msg_id (to ACK): <code>{fetchedMsgId || "—"}</code>
        </div>
      </section>

      <style jsx>{`
        input,
        textarea,
        select,
        button {
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 8px;
        }
        button {
          cursor: pointer;
        }
        code {
          background: #f5f5f5;
          padding: 2px 4px;
          border-radius: 6px;
        }
      `}</style>
    </main>
  );
}
