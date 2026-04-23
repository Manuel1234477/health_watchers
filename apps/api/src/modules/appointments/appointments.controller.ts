import { Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../../middlewares/auth.middleware';
import { validateRequest } from '../../middlewares/validate.middleware';
import { AppointmentModel } from './appointment.model';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  cancelAppointmentSchema,
  appointmentIdParamsSchema,
  doctorIdParamsSchema,
  listAppointmentsQuerySchema,
  availabilityQuerySchema,
} from './appointments.validation';

const router = Router();

// Working hours: 08:00–17:00, slot duration 30 min
const WORK_START_HOUR = 8;
const WORK_END_HOUR   = 17;
const SLOT_MINUTES    = 30;

// POST /api/v1/appointments
router.post(
  '/',
  authenticate,
  validateRequest({ body: createAppointmentSchema }),
  async (req: Request, res: Response) => {
    const clinicId = req.user?.clinicId;
    if (!clinicId) return res.status(401).json({ error: 'Unauthorized' });

    const { scheduledAt, duration = 30, doctorId } = req.body;
    const start = new Date(scheduledAt);
    const end   = new Date(start.getTime() + duration * 60_000);

    // Conflict detection
    const conflict = await AppointmentModel.findOne({
      doctorId,
      status: { $nin: ['cancelled'] },
      scheduledAt: { $lt: end },
      $expr: {
        $gt: [{ $add: ['$scheduledAt', { $multiply: ['$duration', 60_000] }] }, start.getTime()],
      },
    });
    if (conflict) return res.status(409).json({ error: 'Conflict', message: 'Doctor already has an appointment in this time slot' });

    const appointment = await AppointmentModel.create({ ...req.body, clinicId });
    return res.status(201).json({ status: 'success', data: appointment });
  }
);

// GET /api/v1/appointments
router.get(
  '/',
  authenticate,
  validateRequest({ query: listAppointmentsQuerySchema }),
  async (req: Request, res: Response) => {
    const clinicId = req.user?.clinicId;
    const role     = req.user?.role;
    const userId   = req.user?.userId;
    const { doctorId, patientId, status, dateFrom, dateTo, page, limit } = req.query as any;

    const filter: Record<string, any> = { clinicId };

    // RBAC: patients can only see their own appointments (stub — patient role not in current roles)
    if (role === 'READ_ONLY' && userId) filter.patientId = userId;
    if (doctorId)  filter.doctorId  = doctorId;
    if (patientId) filter.patientId = patientId;
    if (status)    filter.status    = status;
    if (dateFrom || dateTo) {
      filter.scheduledAt = {};
      if (dateFrom) filter.scheduledAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.scheduledAt.$lte = new Date(dateTo);
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      AppointmentModel.find(filter).sort({ scheduledAt: 1 }).skip(skip).limit(Number(limit)),
      AppointmentModel.countDocuments(filter),
    ]);

    return res.json({ status: 'success', data, meta: { total, page: Number(page), limit: Number(limit) } });
  }
);

// GET /api/v1/appointments/doctor/:doctorId/availability
router.get(
  '/doctor/:doctorId/availability',
  authenticate,
  validateRequest({ params: doctorIdParamsSchema, query: availabilityQuerySchema }),
  async (req: Request, res: Response) => {
    const { doctorId } = req.params;
    const { date }     = req.query as { date: string };

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    dayStart.setUTCHours(WORK_START_HOUR, 0, 0, 0);
    const dayEnd = new Date(`${date}T00:00:00.000Z`);
    dayEnd.setUTCHours(WORK_END_HOUR, 0, 0, 0);

    const booked = await AppointmentModel.find({
      doctorId,
      status: { $nin: ['cancelled'] },
      scheduledAt: { $gte: dayStart, $lt: dayEnd },
    }).select('scheduledAt duration');

    // Generate all slots
    const slots: { time: string; available: boolean }[] = [];
    for (let t = new Date(dayStart); t < dayEnd; t = new Date(t.getTime() + SLOT_MINUTES * 60_000)) {
      const slotEnd = new Date(t.getTime() + SLOT_MINUTES * 60_000);
      const busy = booked.some(appt => {
        const aEnd = new Date(appt.scheduledAt.getTime() + appt.duration * 60_000);
        return appt.scheduledAt < slotEnd && aEnd > t;
      });
      slots.push({ time: t.toISOString(), available: !busy });
    }

    return res.json({ status: 'success', data: { doctorId, date, slots } });
  }
);

// GET /api/v1/appointments/:id
router.get(
  '/:id',
  authenticate,
  validateRequest({ params: appointmentIdParamsSchema }),
  async (req: Request, res: Response) => {
    const appointment = await AppointmentModel.findOne({ _id: req.params.id, clinicId: req.user?.clinicId });
    if (!appointment) return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });
    return res.json({ status: 'success', data: appointment });
  }
);

// PUT /api/v1/appointments/:id
router.put(
  '/:id',
  authenticate,
  validateRequest({ params: appointmentIdParamsSchema, body: updateAppointmentSchema }),
  async (req: Request, res: Response) => {
    const appointment = await AppointmentModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user?.clinicId },
      req.body,
      { new: true }
    );
    if (!appointment) return res.status(404).json({ error: 'NotFound', message: 'Appointment not found' });
    return res.json({ status: 'success', data: appointment });
  }
);

// DELETE /api/v1/appointments/:id  (cancel — requires reason)
router.delete(
  '/:id',
  authenticate,
  validateRequest({ params: appointmentIdParamsSchema, body: cancelAppointmentSchema }),
  async (req: Request, res: Response) => {
    const appointment = await AppointmentModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user?.clinicId, status: { $nin: ['cancelled', 'completed'] } },
      {
        status: 'cancelled',
        cancelledBy: new mongoose.Types.ObjectId(req.user!.userId),
        cancelledAt: new Date(),
        cancellationReason: req.body.cancellationReason,
      },
      { new: true }
    );
    if (!appointment) return res.status(404).json({ error: 'NotFound', message: 'Appointment not found or already cancelled/completed' });
    return res.json({ status: 'success', data: appointment });
  }
);

export const appointmentRoutes = router;
