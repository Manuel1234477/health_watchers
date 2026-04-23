import { Router, Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  generateClinicalSummary,
  generateRawTextSummary,
  generatePatientInsights,
  isAIServiceAvailable,
  AI_DISCLAIMER,
} from './ai.service';
import { authenticate } from '../../middlewares/auth.middleware';
import logger from '../../utils/logger';

const router = Router();

// GET /api/v1/ai/health
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ai' }));

// POST /api/v1/ai/summarize
// Request body: { encounterId?: string, text?: string }
// Returns: { success: boolean, summary: string, disclaimer: string }
router.post('/summarize', authenticate, async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is not configured. Please contact your administrator.',
      });
    }

    const { encounterId, text } = req.body;

    // Accept either encounterId or raw text
    if (!encounterId && !text) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Either encounterId or text is required',
      });
    }

    let summary: string;

    if (text) {
      // Raw text input
      if (typeof text !== 'string' || text.trim().length < 10) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'text must be a non-empty string with at least 10 characters',
        });
      }
      summary = await generateRawTextSummary(text);
    } else {
      // encounterId input
      if (!isValidObjectId(encounterId)) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Invalid encounterId format',
        });
      }

      const { EncounterModel } = await import('../encounters/encounter.model');
      const encounter = await EncounterModel.findById(encounterId);
      if (!encounter) {
        return res.status(404).json({ error: 'NotFound', message: 'Encounter not found' });
      }

      summary = await generateClinicalSummary({
        chiefComplaint: encounter.chiefComplaint,
        notes: encounter.notes,
        diagnosis: encounter.diagnosis,
        vitalSigns: encounter.vitalSigns,
      });

      // Store the summary in the encounter
      encounter.aiSummary = summary;
      await encounter.save();
    }

    const duration = Date.now() - startTime;
    logger.info({ encounterId, duration, textLength: text?.length }, 'AI summary generated');

    return res.json({
      success: true,
      summary,
      disclaimer: AI_DISCLAIMER,
      ...(encounterId ? { encounterId } : {}),
    });
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    logger.error({ err: error, duration }, 'AI summarize error');

    if (error instanceof Error && error.message.includes('Failed to generate AI summary')) {
      return res.status(503).json({
        error: 'AIServiceError',
        message: 'Failed to generate AI summary. Please try again later.',
      });
    }

    return res.status(500).json({
      error: 'InternalServerError',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    });
  }
});

// POST /api/v1/ai/insights
// Request body: { patientId: string }
// Returns: { success: boolean, insights: string, disclaimer: string }
router.post('/insights', authenticate, async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    if (!isAIServiceAvailable()) {
      return res.status(503).json({
        error: 'AIUnavailable',
        message: 'AI service is not configured. Please contact your administrator.',
      });
    }

    const { patientId } = req.body;
    if (!patientId || !isValidObjectId(patientId)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Valid patientId is required',
      });
    }

    const { EncounterModel } = await import('../encounters/encounter.model');

    // Fetch last 10 encounters for the patient
    const encounters = await EncounterModel.find({
      patientId,
      clinicId: req.user!.clinicId,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    if (encounters.length === 0) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'No encounters found for this patient',
      });
    }

    const insights = await generatePatientInsights(
      encounters.map((e) => ({
        chiefComplaint: e.chiefComplaint,
        notes: e.notes,
        diagnosis: e.diagnosis,
        createdAt: e.createdAt,
      })),
    );

    const duration = Date.now() - startTime;
    logger.info({ patientId, encounterCount: encounters.length, duration }, 'AI insights generated');

    return res.json({
      success: true,
      insights,
      disclaimer: AI_DISCLAIMER,
      patientId,
      encounterCount: encounters.length,
    });
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    logger.error({ err: error, duration }, 'AI insights error');

    if (error instanceof Error && error.message.includes('Failed to generate patient insights')) {
      return res.status(503).json({
        error: 'AIServiceError',
        message: 'Failed to generate patient insights. Please try again later.',
      });
    }

    return res.status(500).json({
      error: 'InternalServerError',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    });
  }
});

export default router;
