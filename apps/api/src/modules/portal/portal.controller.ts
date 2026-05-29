import bcrypt from 'bcryptjs';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { UserModel } from '../auth/models/user.model';
import { PatientModel } from '../patients/models/patient.model';
import { toPatientResponse } from '../patients/patients.transformer';
import { AppointmentModel } from '../appointments/appointment.model';
import { WaitlistModel } from '../appointments/waitlist.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { signAccessToken, signRefreshToken, signTempToken, verifyTempToken, REFRESH_TOKEN_EXPIRY_MS } from '../auth/token.service';
import { RefreshTokenModel } from '../auth/models/refresh-token.model';
import { portalMfaService } from './portal-mfa.service';
import { smsOtpService } from './sms-otp.service';
import crypto from 'crypto';
const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  dateOfBirth: z.string().min(1), // used as second factor to confirm identity
});

const portalMfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  tempToken: z.string().min(1),
});

const requirePatient = requireRoles('PATIENT');

// ── POST /api/v1/portal/auth/login ────────────────────────────────────────────
router.post(
  '/auth/login',
  validateRequest({ body: loginSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, dateOfBirth } = req.body as { email: string; dateOfBirth: string };

    const user = await UserModel.findOne({ email: email.toLowerCase().trim(), role: 'PATIENT', isActive: true });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    // Verify date of birth against linked patient record
    const patient = await PatientModel.findById(user.patientId);
    if (!patient) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Patient record not found' });
    }

    // dateOfBirth stored encrypted; compare decrypted value
    const storedDob = (patient as any).dateOfBirth as string;
    if (storedDob !== dateOfBirth) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    // Check if MFA is enabled
    if (user.portalMfaEnabled) {
      const tempToken = signTempToken(user._id.toString());
      return res.json({
        status: 'success',
        data: {
          mfaRequired: true,
          tempToken,
          mfaMethod: user.portalMfaMethod,
        },
      });
    }

    const payload = {
      userId: String(user._id),
      role: 'PATIENT',
      clinicId: String(user.clinicId),
      patientId: String(user.patientId),
    };

    const accessToken = signAccessToken(payload);
    const { token: refreshToken, jti, family } = signRefreshToken(payload);

    await RefreshTokenModel.create({
      userId: user._id,
      tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      jti,
      family,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    });

    return res.json({ status: 'success', data: { accessToken, refreshToken } });
  }),
);

// ── POST /api/v1/portal/auth/mfa/verify-login ─────────────────────────────────
/**
 * Verify MFA code during portal login
 */
router.post(
  '/auth/mfa/verify-login',
  validateRequest({ body: portalMfaVerifySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { code, tempToken } = req.body;

    const userId = verifyTempToken(tempToken);
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired temp token',
      });
    }

    const user = await UserModel.findById(userId).select('+portalMfaSecret +portalMfaBackupCodes');
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    if (!user.portalMfaEnabled) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'MFA is not enabled for this account',
      });
    }

    // Verify code (TOTP or backup code)
    let isValid = false;

    if (user.portalMfaMethod === 'totp' && user.portalMfaSecret) {
      isValid = portalMfaService.verifyTotp(code, user.portalMfaSecret);
    } else if (user.portalMfaMethod === 'sms' && user.portalPhoneNumber) {
      isValid = smsOtpService.verifyOtp(user.portalPhoneNumber, code);
    }

    // Also check backup codes as fallback
    if (!isValid && user.portalMfaBackupCodes) {
      isValid = portalMfaService.verifyBackupCode(code, user.portalMfaBackupCodes);
      if (isValid) {
        // Remove used backup code
        user.portalMfaBackupCodes = portalMfaService.removeUsedBackupCode(
          code,
          user.portalMfaBackupCodes
        );
        await user.save();
      }
    }

    if (!isValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid verification code',
      });
    }

    const payload = {
      userId: String(user._id),
      role: 'PATIENT',
      clinicId: String(user.clinicId),
      patientId: String(user.patientId),
    };

    const accessToken = signAccessToken(payload);
    const { token: refreshToken, jti, family } = signRefreshToken(payload);

    await RefreshTokenModel.create({
      userId: user._id,
      tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      jti,
      family,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    });

    return res.json({ status: 'success', data: { accessToken, refreshToken } });
  }),
);

// ── GET /api/v1/portal/me ─────────────────────────────────────────────────────
router.get(
  '/me',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const patient = await PatientModel.findById(req.user!.patientId);
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
    return res.json({ status: 'success', data: toPatientResponse(patient) });
  }),
);

// ── GET /api/v1/portal/appointments ──────────────────────────────────────────
router.get(
  '/appointments',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const appointments = await AppointmentModel.find({
      patientId: req.user!.patientId,
      clinicId: req.user!.clinicId,
    })
      .sort({ scheduledAt: -1 })
      .lean();
    return res.json({ status: 'success', data: appointments });
  }),
);

// ── GET /api/v1/portal/invoices ───────────────────────────────────────────────
router.get(
  '/invoices',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const invoices = await PaymentRecordModel.find({
      patientId: req.user!.patientId,
      clinicId: req.user!.clinicId,
    })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ status: 'success', data: invoices });
  }),
);

// ── POST /api/v1/portal/invoices/:id/pay ─────────────────────────────────────
// Marks a pending invoice as confirmed (actual Stellar tx handled client-side)
router.post(
  '/invoices/:id/pay',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const { txHash } = req.body as { txHash?: string };

    const invoice = await PaymentRecordModel.findOneAndUpdate(
      { _id: req.params.id, patientId: req.user!.patientId, clinicId: req.user!.clinicId, status: 'pending' },
      { status: 'confirmed', txHash, confirmedAt: new Date() },
      { new: true },
    );

    if (!invoice) {
      return res.status(404).json({ error: 'NotFound', message: 'Invoice not found or already paid' });
    }

    return res.json({ status: 'success', data: invoice });
  }),
);

// ── GET /api/v1/portal/waitlist/position ─────────────────────────────────────
router.get(
  '/waitlist/position',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, patientId } = req.user!;

    const entry = await WaitlistModel.findOne({
      patientId: new Types.ObjectId(patientId),
      clinicId:  new Types.ObjectId(clinicId),
      status:    { $in: ['waiting', 'notified'] },
    }).lean();

    if (!entry) return res.json({ status: 'success', data: null });

    const ahead = await WaitlistModel.countDocuments({
      clinicId:  new Types.ObjectId(clinicId),
      status:    { $in: ['waiting', 'notified'] },
      _id:       { $ne: entry._id },
      $or: [
        { priorityOrder: { $gt: (entry as any).priorityOrder ?? 0 } },
        { priorityOrder: (entry as any).priorityOrder ?? 0, addedAt: { $lt: entry.addedAt } },
      ],
    });

    return res.json({ status: 'success', data: { ...entry, position: ahead + 1 } });
  }),
);

// ── POST /api/v1/portal/waitlist ──────────────────────────────────────────────
const joinWaitlistSchema = z.object({
  doctorId:        z.string().regex(/^[a-f\d]{24}$/i).optional(),
  requestedDate:   z.string().datetime({ offset: true }),
  appointmentType: z.enum(['consultation', 'follow-up', 'procedure', 'emergency']),
  priority:        z.enum(['routine', 'urgent']).default('routine'),
});

router.post(
  '/waitlist',
  authenticate,
  requirePatient,
  validateRequest({ body: joinWaitlistSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, patientId } = req.user!;
    const { priority, doctorId, requestedDate, appointmentType } = req.body;

    const existing = await WaitlistModel.findOne({
      patientId: new Types.ObjectId(patientId),
      clinicId:  new Types.ObjectId(clinicId),
      status:    { $in: ['waiting', 'notified'] },
    });
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: 'Already on the waitlist' });
    }

    const priorityOrder = priority === 'urgent' ? 1 : 0;
    const aheadCount = await WaitlistModel.countDocuments({
      clinicId: new Types.ObjectId(clinicId),
      status:   { $in: ['waiting', 'notified'] },
      ...(priority === 'urgent' ? { priorityOrder: 1 } : {}),
    });

    const entry = await WaitlistModel.create({
      patientId:       new Types.ObjectId(patientId),
      clinicId:        new Types.ObjectId(clinicId),
      doctorId:        doctorId ? new Types.ObjectId(doctorId) : undefined,
      requestedDate:   new Date(requestedDate),
      appointmentType,
      priority,
      priorityOrder,
      position:        aheadCount + 1,
    });

    return res.status(201).json({ status: 'success', data: entry });
  }),
);

// ── DELETE /api/v1/portal/waitlist/:id ────────────────────────────────────────
router.delete(
  '/waitlist/:id',
  authenticate,
  requirePatient,
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, patientId } = req.user!;

    const entry = await WaitlistModel.findOneAndDelete({
      _id:       new Types.ObjectId(req.params.id),
      clinicId:  new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
    });

    if (!entry) {
      return res.status(404).json({ error: 'NotFound', message: 'Waitlist entry not found' });
    }

    return res.json({ status: 'success', data: entry });
  }),
);

// ── MFA Routes ────────────────────────────────────────────────────────────────
// Import and use MFA routes
import { portalMfaRoutes } from './portal-mfa.routes';
router.use(portalMfaRoutes);

// ── HIPAA Right of Access data-export routes ───────────────────────────────────
import { exportRequestRoutes } from '../export/export-request.controller';
router.use(exportRequestRoutes);

export { router as portalRoutes };
