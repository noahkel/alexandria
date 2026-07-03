import boom from '@hapi/boom';
import express from 'express';
import { MachineTranslationRequestSchema } from '@alexandria/shared';
import machineTranslation from '../services/machineTranslation';
import { validate } from '../utils/middleware';

const machineTranslationRouter = express.Router();

machineTranslationRouter.get(
  '/',
  validate({ query: MachineTranslationRequestSchema }),
  async (_req, res) => {
    if (!machineTranslation.isConfigured()) {
      throw boom.notImplemented('Machine translation is not configured.');
    }

    const { word, sourceLanguageId, targetLanguageId } = res.locals.query;

    const translation = await machineTranslation.translateWord(
      word,
      sourceLanguageId,
      targetLanguageId
    );

    res.json({ translation });
  }
);

export default machineTranslationRouter;
