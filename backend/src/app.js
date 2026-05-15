import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/index.js';

const app = express();
const audioDirectory = fileURLToPath(new URL('../uploads/audio', import.meta.url));

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(morgan('dev'));
app.use(express.json());
app.use('/uploads/audio', express.static(audioDirectory));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRoutes);

export default app;
