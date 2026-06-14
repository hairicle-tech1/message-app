import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import conversationsRoutes from './modules/conversations/conversations.routes.js';
import filesRoutes from './modules/files/files.routes.js';
import messagesRoutes from './modules/messages/messages.routes.js';
import usersRoutes from './modules/users/users.routes.js';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/files', filesRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
