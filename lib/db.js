const { MongoClient } = require('mongodb');

let client = null;
let connecting = null;

async function getClient() {
  // If already connected and alive, return immediately
  if (client && client.topology?.isConnected()) return client;

  // If a connection attempt is already in progress, wait for it
  if (connecting) return connecting;

  connecting = (async () => {
    if (client) {
      try { await client.close(); } catch (_) {}
      client = null;
    }
    const c = new MongoClient(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      retryWrites: false
    });
    c.on('topologyClosed', () => { if (client === c) client = null; });
    await c.connect();
    client = c;
    console.log('MongoDB connected');
    return client;
  })().finally(() => { connecting = null; });

  return connecting;
}

module.exports = { getClient };
