const Fastify = require('fastify');
const app = Fastify({ logger: true });

const store = new Map();

// ✅ use the new plugin name
app.register(require('@fastify/cors'), { origin: true });

// POST a new encrypted message
app.post('/v1/conversations/:conv/messages', async (req, reply) => {
  const conv = req.params.conv;
  const body = req.body;
  if (!store.has(conv)) store.set(conv, []);
  store.get(conv).push(body);
  reply.code(201).send({ ok: true });
});

// GET pending messages
app.get('/v1/conversations/:conv/messages', async (req, reply) => {
  const conv = req.params.conv;
  const msgs = store.get(conv) || [];
  reply.send({ msgs });
});

// ACK + delete a specific message
app.post('/v1/conversations/:conv/messages/:msg/ack', async (req, reply) => {
  const conv = req.params.conv;
  const msg = req.params.msg;
  const msgs = store.get(conv) || [];
  const idx = msgs.findIndex(m => m.msg_id === msg);
  if (idx !== -1) {
    msgs.splice(idx, 1);
    return { ok: true };
  }
  reply.code(404).send({ ok: false, err: 'not found' });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`Relay server listening on ${PORT}`))
  .catch(err => {
    app.log.error(err);
    process.exit(1);
  });
