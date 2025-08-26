// backend/app.js (ESM)
import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';

import { typeDefs } from './bd/schema.js';
import { resolvers } from './bd/resolvers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function start() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // GraphQL
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const server = new ApolloServer({ schema });
  await server.start();
  app.use('/graphql', expressMiddleware(server));

  // Frontend estático (sirve /frontend)
  // app.js
  const frontendPath = path.join(__dirname, '..', 'frontend');

  app.use(express.static(frontendPath));

  app.get('/*', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });


  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, () => {
    console.log(`✅ Server listo en http://localhost:${PORT}`);
    console.log(`🧩 GraphQL en http://localhost:${PORT}/graphql`);
  });
}

start().catch((e) => {
  console.error('❌ Error iniciando app:', e);
});
