import express from 'express';
import { errorHandler, notFoundHandler } from './errors.js';
import { healthRouter } from './routes/health.js';

/**
 * Builds the Express app without starting a server, so integration tests can
 * drive it with supertest.
 */
export function createApp() {
  const app = express();

  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
