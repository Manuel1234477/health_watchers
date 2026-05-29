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
import { paginate, parsePagination } from '@api/utils/paginate';
import { signAccessToken, signRefreshToken, signTempToken, verifyTempToken, REFRESH_TOKEN_EXPIRY_MS } from '../auth/token.service';
import { RefreshTokenModel } from '../auth/models/refresh-token.model';
import { portalMfaService } from './portal-mfa.service';
import { smsOtpService } from './sms-otp.service';
import { PortalMessageModel } from './models/portal-message.model';
import { portalMessageCreateSchema, portalMessageQuerySchema, portalTimelineQuerySchema, type TimelineEvent } from './portal.validation';
import { EncounterModel } from '../encounters/encounter.model';
import { LabResultModel } from '../lab-results/lab-result.model';
import { ImmunizationModel } from '../immunizations/immunization.model';
import { emitToClinic, emitToUser } from '@api/realtime/socket';
import { sendMail } from '@api/lib/email.service';
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
const requireStaff = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN', 'NURSE');

async function notifyStaffAboutPatientMessage(message: any, patientName: string) {
  const recipients = await UserModel.find({
    clinicId: new Types.ObjectId(String(message.clinicId)),
    role: { $in: ['DOCTOR', 'NURSE', 'CLINIC_ADMIN', 'SUPER_ADMIN'] },
    isActive: true,
    'preferences.emailNotifications': true,
  }).lean();

  const payload = {
    messageId: String(message._id),
    threadId: String(message.threadId),
    clinicId: String(message.clinicId),
    patientId: String(message.patientId),
    subject: message.subject,
    body: message.body,
    direction: message.direction,
    createdAt: message.createdAt,
    senderRole: message.senderRole,
  };

  emitToClinic(String(message.clinicId), 'portal:message:new', payload);

  for (const staff of recipients) {
    if (!staff.email) continue;
    sendMail({
      to: staff.email,
      subject: `New portal message from ${patientName}`,
      html: `
        <p>Hello ${staff.fullName || 'Care team'},</p>
        <p>A new secure message was sent by <strong>${patientName}</strong> through the patient portal.</p>
        <p><strong>Subject:</strong> ${message.subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message.body}</p>
        <p>Please respond through the care team portal.</p>
      `,
    }).catch(() => undefined);
  }
}

async function notifyPatientAboutStaffReply(message: any, patientUser: any, patientName: string) {
  const payload = {
    messageId: String(message._id),
    threadId: String(message.threadId),
    clinicId: String(message.clinicId),
    patientId: String(message.patientId),
    subject: message.subject,
    body: message.body,
    direction: message.direction,
    createdAt: message.createdAt,
    senderRole: message.senderRole,
  };

  emitToUser(String(patientUser._id), 'portal:message:new', payload);

  if (!patientUser.email || patientUser.preferences?.emailNotifications === false) return;

  sendMail({
    to: patientUser.email,
    subject: `Reply from your care team`,
    html: `
      <p>Hi ${patientName},</p>
      <p>Your care team has replied to your portal message.</p>
      <p><strong>Subject:</strong> ${message.subject}</p>
      <p>${message.body}</p>
      <p>Please log in to the patient portal to view the full thread.</p>
    `,
  }).catch(() => undefined);
}

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

// ── POST /api/v1/portal/messages ─────────────────────────────────────────────
router.post(
  '/messages',
  authenticate,
  requirePatient,
  validateRequest({ body: portalMessageCreateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, patientId, userId } = req.user!;
    const { subject, body, attachments, threadId, parentMessageId } = req.body as {
      subject: string;
      body: string;
      attachments?: any[];
      threadId?: string;
      parentMessageId?: string;
    };

    const patient = await PatientModel.findById(patientId).lean();
    if (!patient) {
      return res.status(404).json({ error: 'NotFound', message: 'Patient record not found' });
    }

    const message = await PortalMessageModel.create({
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
      senderId: new Types.ObjectId(userId),
      senderRole: 'PATIENT',
      subject,
      body,
      direction: 'patient_to_staff',
      threadId: threadId ? new Types.ObjectId(threadId) : new Types.ObjectId(),
      parentMessageId: parentMessageId ? new Types.ObjectId(parentMessageId) : undefined,
      attachments,
    });

    const patientName = `${(patient as any).firstName || ''} ${(patient as any).lastName || ''}`.trim() || 'Patient';
    await notifyStaffAboutPatientMessage(message, patientName);

    return res.status(201).json({ status: 'success', data: message });
  }),
);

// ── GET /api/v1/portal/messages ──────────────────────────────────────────────
router.get(
  '/messages',
  authenticate,
  requirePatient,
  validateRequest({ query: portalMessageQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, patientId } = req.user!;
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const { q, threadId } = req.query as { q?: string; threadId?: string };

    const filter: Record<string, any> = {
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(patientId),
    };

    if (threadId) filter.threadId = new Types.ObjectId(threadId);
    if (q) {
      filter.$or = [
        { subject: { $regex: q, $options: 'i' } },
        { body: { $regex: q, $options: 'i' } },
      ];
    }

    const result = await paginate(PortalMessageModel, filter, page, limit, { createdAt: -1 });
    return res.json({ status: 'success', data: result.data, meta: result.meta });
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

/**
 * @swagger
 * /portal/timeline:
 *   get:
 *     summary: Get patient health record timeline
 *     description: Returns all health events (encounters, lab results, immunizations, prescriptions, appointments) in chronological order.
 *     tags: [Portal]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *           enum: [encounter, lab_result, immunization, prescription, appointment]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Timeline events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TimelineEvent'
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 */
// ── GET /api/v1/portal/timeline ──────────────────────────────────────────────
router.get(
  '/timeline',
  authenticate,
  requirePatient,
  validateRequest({ query: portalTimelineQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId, patientId } = req.user!;
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res.status(400).json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const { eventType, startDate, endDate } = req.query as {
      eventType?: string;
      startDate?: string;
      endDate?: string;
    };

    const patientFilter = {
      patientId: new Types.ObjectId(patientId),
      clinicId: new Types.ObjectId(clinicId),
    };

    const dateFilter: Record<string, unknown> = {};
    if (startDate || endDate) {
      const df: Record<string, Date> = {};
      if (startDate) df.$gte = new Date(startDate);
      if (endDate) df.$lte = new Date(endDate);
      dateFilter.createdAt = df;
    }

    const fetchAll = !eventType;

    const fetchEncounters = fetchAll || eventType === 'encounter';
    const fetchLabResults = fetchAll || eventType === 'lab_result';
    const fetchImmunizations = fetchAll || eventType === 'immunization';
    const fetchAppointments = fetchAll || eventType === 'appointment';
    const fetchPrescriptions = fetchAll || eventType === 'prescription';

    const queries: Promise<TimelineEvent[]>[] = [];

    if (fetchEncounters) {
      queries.push(
        EncounterModel.find({ ...patientFilter, ...dateFilter })
          .sort({ createdAt: -1 })
          .lean()
          .then((encounters) =>
            encounters.map((e) => ({
              id: String(e._id),
              type: 'encounter' as const,
              date: (e.createdAt as unknown as Date)?.toISOString?.() ?? new Date().toISOString(),
              title: `${e.type ?? 'Consultation'} — ${e.chiefComplaint || 'Encounter'}`,
              description: e.soapNotes?.assessment ?? e.notes ?? 'No details',
              details: {
                chiefComplaint: e.chiefComplaint,
                type: e.type,
                status: e.status,
                diagnosis: e.diagnosis,
                vitalSigns: e.vitalSigns,
                soapNotes: e.soapNotes,
                treatmentPlan: e.treatmentPlan,
              },
              clinicId: String(e.clinicId),
              createdAt: (e.createdAt as unknown as Date)?.toISOString?.() ?? new Date().toISOString(),
            })),
          ),
      );
    }

    if (fetchLabResults) {
      queries.push(
        LabResultModel.find({ ...patientFilter, ...dateFilter })
          .sort({ createdAt: -1 })
          .lean()
          .then((results) =>
            results.map((r) => ({
              id: String(r._id),
              type: 'lab_result' as const,
              date: (r.createdAt as unknown as Date)?.toISOString?.() ?? new Date().toISOString(),
              title: r.testName,
              description: r.status === 'resulted'
                ? (r.results ?? []).map((res) => `${res.parameter}: ${res.value} ${res.unit}`).join(', ')
                : `Status: ${r.status}`,
              details: {
                testName: r.testName,
                testCode: r.testCode,
                status: r.status,
                orderedAt: r.orderedAt,
                resultedAt: r.resultedAt,
                results: r.results,
                isCritical: r.isCritical,
                notes: r.notes,
              },
              clinicId: String(r.clinicId),
              createdAt: (r.createdAt as unknown as Date)?.toISOString?.() ?? new Date().toISOString(),
            })),
          ),
      );
    }

    if (fetchImmunizations) {
      queries.push(
        ImmunizationModel.find({ ...patientFilter, ...dateFilter })
          .sort({ createdAt: -1 })
          .lean()
          .then((immunizations) =>
            immunizations.map((i) => ({
              id: String(i._id),
              type: 'immunization' as const,
              date: i.administeredDate.toISOString(),
              title: `${i.vaccineName} (Dose ${i.doseNumber})`,
              description: `Administered ${i.administeredDate.toLocaleDateString()}${i.manufacturer ? ` — ${i.manufacturer}` : ''}`,
              details: {
                vaccineName: i.vaccineName,
                vaccineCode: i.vaccineCode,
                manufacturer: i.manufacturer,
                lotNumber: i.lotNumber,
                administeredDate: i.administeredDate,
                doseNumber: i.doseNumber,
                seriesComplete: i.seriesComplete,
                route: i.route,
                site: i.site,
                notes: i.notes,
              },
              clinicId: String(i.clinicId),
              createdAt: (i.createdAt as unknown as Date)?.toISOString?.() ?? new Date().toISOString(),
            })),
          ),
      );
    }

    if (fetchAppointments) {
      queries.push(
        AppointmentModel.find({ ...patientFilter, ...dateFilter })
          .sort({ createdAt: -1 })
          .lean()
          .then((appointments) =>
            appointments.map((a) => ({
              id: String(a._id),
              type: 'appointment' as const,
              date: a.scheduledAt.toISOString(),
              title: `${a.type} — ${a.status}`,
              description: a.chiefComplaint ?? 'No chief complaint recorded',
              details: {
                scheduledAt: a.scheduledAt,
                duration: a.duration,
                type: a.type,
                status: a.status,
                chiefComplaint: a.chiefComplaint,
                isTelemedicine: a.isTelemedicine,
                notes: a.notes,
              },
              clinicId: String(a.clinicId),
              createdAt: (a.createdAt as unknown as Date)?.toISOString?.() ?? new Date().toISOString(),
            })),
          ),
      );
    }

    if (fetchPrescriptions) {
      queries.push(
        EncounterModel.find({ ...patientFilter, ...dateFilter, prescriptions: { $exists: true, $ne: [] } })
          .sort({ createdAt: -1 })
          .lean()
          .then((encounters) => {
            const events: TimelineEvent[] = [];
            for (const e of encounters) {
              if (!e.prescriptions) continue;
              for (const p of e.prescriptions) {
                events.push({
                  id: `${String(e._id)}_rx_${p.drugName.replace(/\s+/g, '_')}`,
                  type: 'prescription' as const,
                  date: (p.prescribedAt ?? e.createdAt)?.toISOString?.() ?? new Date().toISOString(),
                  title: p.drugName,
                  description: `${p.dosage}, ${p.frequency} — ${p.duration}`,
                  details: {
                    drugName: p.drugName,
                    genericName: p.genericName,
                    dosage: p.dosage,
                    frequency: p.frequency,
                    duration: p.duration,
                    route: p.route,
                    instructions: p.instructions,
                    refillsAllowed: p.refillsAllowed,
                    encounterId: String(e._id),
                  },
                  clinicId: String(e.clinicId),
                  createdAt: (e.createdAt as unknown as Date)?.toISOString?.() ?? new Date().toISOString(),
                });
              }
            }
            return events;
          }),
      );
    }

    const allEvents = (await Promise.all(queries)).flat();

    // Sort by date descending (most recent first)
    allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const total = allEvents.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginatedData = allEvents.slice(start, start + limit);

    return res.json({
      status: 'success',
      data: paginatedData,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextCursor: null,
      },
    });
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
