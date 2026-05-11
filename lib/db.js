const { MongoClient } = require('mongodb');

let client = null;

async function getClient() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    client.on('close', () => { client = null; });
    client.on('topologyClosed', () => { client = null; });
    await client.connect();
    console.log('MongoDB connected');
  }
  return client;
}

module.exports = { getClient };
