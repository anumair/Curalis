import * as doctorsService from './doctors.service.js';
import { toPublicUser } from '../../utils/serializers.js';

function toPublicDoctor(doctorProfile) {
  const { userId, specialisation, qualification, bio, consultationFee, slotDurationMin, isAcceptingPatients, user } =
    doctorProfile;
  return {
    id: userId,
    fullName: user.fullName,
    timezone: user.timezone,
    specialisation,
    qualification,
    bio,
    consultationFee,
    slotDurationMin,
    isAcceptingPatients,
  };
}

export async function listDoctors(req, res) {
  const { doctors, total, page, pageSize } = await doctorsService.listDoctors(req.query);
  res.json({ doctors: doctors.map(toPublicDoctor), total, page, pageSize });
}

export async function getDoctorById(req, res) {
  const doctor = await doctorsService.getDoctorById(req.params.id);
  res.json({ doctor: toPublicDoctor(doctor) });
}

export async function listSpecialisations(req, res) {
  const specialisations = await doctorsService.listSpecialisations();
  res.json({ specialisations });
}

export async function getMySchedule(req, res) {
  const appointments = await doctorsService.getMySchedule(req.user.id, req.query.date);
  res.json({ appointments });
}

export async function getMyAwaitingNotes(req, res) {
  const appointments = await doctorsService.getMyAwaitingNotes(req.user.id);
  res.json({ appointments });
}

export async function getMyWorkingHoursAndLeave(req, res) {
  const result = await doctorsService.getMyWorkingHoursAndLeave(req.user.id);
  res.json(result);
}

export async function adminListDoctors(req, res) {
  const doctors = await doctorsService.listAllDoctorsForAdmin();
  res.json({ doctors });
}

export async function adminGetDoctorById(req, res) {
  const doctor = await doctorsService.getDoctorDetailForAdmin(req.params.id);
  res.json({ doctor });
}

export async function adminCreateDoctor(req, res) {
  const { user, temporaryPassword } = await doctorsService.createDoctor(req.body);
  res.status(201).json({ user: toPublicUser(user), temporaryPassword });
}

export async function adminUpdateDoctor(req, res) {
  const user = await doctorsService.updateDoctor(req.params.id, req.body);
  res.json({ user: toPublicUser(user) });
}

export async function adminSetWorkingHours(req, res) {
  const workingHours = await doctorsService.replaceWorkingHours(req.params.id, req.body);
  res.json({ workingHours });
}
