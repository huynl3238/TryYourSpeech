import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: 'IELTS Speaking API' });
});

export default router;
