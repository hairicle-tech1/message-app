import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import adminRoutes from './modules/admin/admin.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import callsRoutes from './modules/calls/calls.routes.js';
import departmentsRoutes from './modules/departments/departments.routes.js';
import meetingsRoutes from './modules/meetings/meetings.routes.js';
import tasksRoutes from './modules/tasks/tasks.routes.js';
import teamsRoutes from './modules/teams/teams.routes.js';
import conversationsRoutes from './modules/conversations/conversations.routes.js';
import filesRoutes from './modules/files/files.routes.js';
import messagesRoutes from './modules/messages/messages.routes.js';
import usersRoutes from './modules/users/users.routes.js';

export const app = express();

// Disable CSP for Swagger UI (it loads inline scripts)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/teams', teamsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
