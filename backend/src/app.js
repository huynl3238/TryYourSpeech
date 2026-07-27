import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import { corsOptions } from './config/cors.js';
import { attachUser } from './middleware/auth.js';

const app = express();
const audioDirectory = fileURLToPath(new URL('../uploads/audio', import.meta.url));

app.use(cors(corsOptions));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads/audio', express.static(audioDirectory));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Resolves req.user from the auth cookie for every API request. It never
// rejects on its own — routes opt in with requireAuth / requireRole.
app.use('/api', attachUser);
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

export default app;
