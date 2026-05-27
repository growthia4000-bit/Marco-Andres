import { DEFAULT_TIMEZONE } from '@/i18n/config'

interface ExistingAppointment {
  start_time: string
  end_time: string
  status: string
}

export interface TimeSlot {
  start: string
  end: string
  label: string
  date: string
  time: string
}

export interface OccupiedSlotDayView {
  occupied: Set<string>
  appointmentCount: number
}

interface AvailabilityParams {
  tenantId: string
  userId?: string
  date?: Date
  durationMinutes?: number
  businessHourStart?: number
  businessHourEnd?: number
  daysAhead?: number
}

const MONTHS_ES: Record<string, number> = {
  ene: 0, enero: 0,
  feb: 1, febrero: 1,
  mar: 2, marzo: 2,
  abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5,
  jul: 6, julio: 6,
  ago: 7, agosto: 7,
  sep: 8, sept: 8, septiembre: 8,
  oct: 9, octubre: 9,
  nov: 10, noviembre: 10,
  dic: 11, diciembre: 11,
}

export function findAvailableSlots(
  existingAppointments: ExistingAppointment[],
  params: AvailabilityParams
): TimeSlot[] {
  const {
    date = new Date(),
    durationMinutes = 60,
    businessHourStart = 9,
    businessHourEnd = 19,
    daysAhead = 5,
  } = params

  const slots: TimeSlot[] = []
  const timezone = DEFAULT_TIMEZONE
  const occupied = existingAppointments
    .filter(a => a.status !== 'cancelled' && a.status !== 'no_show')
    .map(a => ({
      start: new Date(a.start_time).getTime(),
      end: new Date(a.end_time).getTime(),
    }))

  for (let day = 1; day <= daysAhead; day++) {
    const seed = getZonedParts(date, timezone)
    const slotDate = new Date(Date.UTC(seed.year, seed.month - 1, seed.day))
    slotDate.setUTCDate(slotDate.getUTCDate() + day)

    if (slotDate.getUTCDay() === 0) continue

    for (let hour = businessHourStart; hour < businessHourEnd; hour++) {
      for (const minute of [0, 30]) {
        const slotStart = zonedLocalToUtcDate({
          year: slotDate.getUTCFullYear(),
          month: slotDate.getUTCMonth(),
          day: slotDate.getUTCDate(),
          hour,
          minute,
        }, timezone)
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000)

        const slotEndLocal = getZonedParts(slotEnd, timezone)
        if (slotEndLocal.hour > businessHourEnd ||
            (slotEndLocal.hour === businessHourEnd && slotEndLocal.minute > 0)) {
          continue
        }

        const hasOverlap = occupied.some(occ =>
          slotStart.getTime() < occ.end && slotEnd.getTime() > occ.start
        )

        if (!hasOverlap) {
          const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
          const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
          const localParts = {
            year: slotDate.getUTCFullYear(),
            month: slotDate.getUTCMonth(),
            day: slotDate.getUTCDate(),
            hour,
            minute,
          }
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            label: `${dayNames[slotDate.getUTCDay()]} ${localParts.day} ${monthNames[localParts.month]} · ${String(localParts.hour).padStart(2, '0')}:${String(localParts.minute).padStart(2, '0')}`,
            date: `${localParts.year}-${String(localParts.month + 1).padStart(2, '0')}-${String(localParts.day).padStart(2, '0')}`,
            time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          })
        }

        if (slots.length >= 6) break
      }
      if (slots.length >= 6) break
    }
    if (slots.length >= 6) break
  }

  return slots
}

export function findAvailableSlotsForDate(
  existingAppointments: ExistingAppointment[],
  date: Date,
  params: AvailabilityParams
): TimeSlot[] {
  const timezone = DEFAULT_TIMEZONE
  const slots = collectDaySlots(existingAppointments, date, params, timezone)
  const now = new Date()

  return slots.filter((slot) => new Date(slot.start).getTime() > now.getTime())
}

export function isSlotAvailable(
  existingAppointments: ExistingAppointment[],
  start: Date,
  end: Date
): boolean {
  const occupied = existingAppointments
    .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
    .map((a) => ({ start: new Date(a.start_time).getTime(), end: new Date(a.end_time).getTime() }))

  return !occupied.some((occ) => start.getTime() < occ.end && end.getTime() > occ.start)
}

export function findAlternativeSlots(
  existingAppointments: ExistingAppointment[],
  requestedStart: Date,
  params: AvailabilityParams
): TimeSlot[] {
  const timezone = DEFAULT_TIMEZONE
  const sameDaySlots = collectDaySlots(existingAppointments, requestedStart, params, timezone)
  if (sameDaySlots.length > 0) {
    return sameDaySlots
      .sort((a, b) => {
        const aDiff = Math.abs(new Date(a.start).getTime() - requestedStart.getTime())
        const bDiff = Math.abs(new Date(b.start).getTime() - requestedStart.getTime())
        return aDiff - bDiff
      })
      .slice(0, 6)
  }

  return findAvailableSlots(existingAppointments, {
    ...params,
    date: requestedStart,
    daysAhead: Math.max(params.daysAhead || 2, 2),
  })
}

export function parseExactAppointmentDateTime(text: string, now = new Date()): TimeSlot | null {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const timezone = DEFAULT_TIMEZONE

  const labelMatch = normalized.match(/(?:lun|mar|mie|jue|vie|sab|dom)\s+(\d{1,2})\s+([a-z]{3})\s+·\s+(\d{1,2}):(\d{2})/)
  if (labelMatch) {
    const day = Number(labelMatch[1])
    const month = MONTHS_ES[labelMatch[2]]
    const hour = Number(labelMatch[3])
    const minute = Number(labelMatch[4])
    if (month !== undefined) {
      const current = getZonedParts(now, timezone)
      let year = current.year
      const start = zonedLocalToUtcDate({ year, month, day, hour, minute }, timezone)
      if (start.getTime() < now.getTime()) year += 1
      const finalStart = zonedLocalToUtcDate({ year, month, day, hour, minute }, timezone)
      const end = new Date(finalStart.getTime() + 60 * 60 * 1000)
      return toSlot(finalStart, end, { year, month, day, hour, minute })
    }
  }

  const fullMatch = normalized.match(/(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?(?:\s+a\s+las\s+)?(\d{1,2})(?::(\d{2}))?(?:\s+de\s+la\s+(manana|tarde|noche))?/) 
  if (fullMatch) {
    const day = Number(fullMatch[1])
    const month = MONTHS_ES[fullMatch[2]]
    const explicitYear = fullMatch[3] ? Number(fullMatch[3]) : null
    let hour = Number(fullMatch[4])
    const minute = fullMatch[5] ? Number(fullMatch[5]) : 0
    const period = fullMatch[6]

    if (period === 'tarde' && hour < 12) hour += 12
    if (period === 'noche' && hour < 12) hour += 12

    if (month !== undefined) {
      let year = explicitYear || getZonedParts(now, timezone).year
      const start = zonedLocalToUtcDate({ year, month, day, hour, minute }, timezone)
      if (!explicitYear && start.getTime() < now.getTime()) year += 1
      const finalStart = zonedLocalToUtcDate({ year, month, day, hour, minute }, timezone)
      const end = new Date(finalStart.getTime() + 60 * 60 * 1000)
      return toSlot(finalStart, end, { year, month, day, hour, minute })
    }
  }

  return null
}

export function parseAppointmentDateReference(text: string, now = new Date()): Date | null {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const timezone = DEFAULT_TIMEZONE

  const fullDateMatch = normalized.match(/(?:lun(?:es)?|mar(?:tes)?|mie(?:rcoles)?|jue(?:ves)?|vie(?:rnes)?|sab(?:ado)?|dom(?:ingo)?\s+)?(?:dia|día|el)?\s*(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/) 
  if (fullDateMatch) {
    const day = Number(fullDateMatch[1])
    const month = MONTHS_ES[fullDateMatch[2]]
    if (month !== undefined) {
      const explicitYear = fullDateMatch[3] ? Number(fullDateMatch[3]) : null
      let year = explicitYear || getZonedParts(now, timezone).year
      const start = zonedLocalToUtcDate({ year, month, day, hour: 12, minute: 0 }, timezone)
      if (!explicitYear && start.getTime() < now.getTime()) year += 1
      return zonedLocalToUtcDate({ year, month, day, hour: 12, minute: 0 }, timezone)
    }
  }

  const dayOnlyMatch = normalized.match(/(?:lun(?:es)?|mar(?:tes)?|mie(?:rcoles)?|jue(?:ves)?|vie(?:rnes)?|sab(?:ado)?|dom(?:ingo)?\s+)?(?:dia|día|el)\s+(\d{1,2})(?![:\d])/)
  if (dayOnlyMatch) {
    const day = Number(dayOnlyMatch[1])
    const current = getZonedParts(now, timezone)
    let year = current.year
    let month = current.month - 1

    if (day < current.day) {
      month += 1
      if (month > 11) {
        month = 0
        year += 1
      }
    }

    return zonedLocalToUtcDate({ year, month, day, hour: 12, minute: 0 }, timezone)
  }

  return null
}

export function buildSlotFromDateAndTime(date: Date, time: string, durationMinutes = 60): TimeSlot | null {
  const match = time.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null

  const timezone = DEFAULT_TIMEZONE
  const localDate = getZonedParts(date, timezone)
  const hour = Number(match[1])
  const minute = Number(match[2])
  const start = zonedLocalToUtcDate({
    year: localDate.year,
    month: localDate.month - 1,
    day: localDate.day,
    hour,
    minute,
  }, timezone)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  return toSlot(start, end, {
    year: localDate.year,
    month: localDate.month - 1,
    day: localDate.day,
    hour,
    minute,
  })
}

export function isAppointmentConfirmation(text: string): boolean {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return /(si|sí|confirma|confirmar|reserva|reservar|agend(a|ar)|perfecto|vale|ok|me sirve|esa|esa hora|la de)/.test(normalized)
}

export function extractTimeFromNaturalResponse(text: string): string | null {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const timeMatch = normalized.match(/(?:a\s+las\s+|de\s+las\s+|la\s+de\s+las\s+|las\s+)(\d{1,2}):(\d{2})/)
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')}`
  }

  const ampmMatch = normalized.match(/(?:a\s+las\s+|las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/)
  if (ampmMatch) {
    let hour = Number(ampmMatch[1])
    const minute = Number(ampmMatch[2] || 0)
    const period = ampmMatch[3]
    if (period === 'pm' && hour < 12) hour += 12
    if (period === 'am' && hour === 12) hour = 0
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  const periodMatch = normalized.match(/(?:a\s+las\s+|las\s+)?(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+y\s+media)?\s+de\s+la\s+(manana|tarde|noche)/)
  if (periodMatch) {
    const wordToHour: Record<string, number> = {
      una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
      siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
    }
    let hour = /^\d+$/.test(periodMatch[1]) ? Number(periodMatch[1]) : wordToHour[periodMatch[1]]
    const minute = normalized.includes('y media') ? 30 : 0
    const period = periodMatch[2]
    if ((period === 'tarde' || period === 'noche') && hour < 12) hour += 12
    if (period === 'manana' && hour === 12) hour = 0
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  if (/medio dia|mediodia/.test(normalized)) {
    return '12:00'
  }

  const bareTime = normalized.match(/(\d{1,2}):(\d{2})/)
  if (bareTime) {
    return `${bareTime[1].padStart(2, '0')}:${bareTime[2].padStart(2, '0')}`
  }
  return null
}

function getTimeDistanceMinutes(a: string, b: string) {
  const [aHour, aMinute] = a.split(':').map(Number)
  const [bHour, bMinute] = b.split(':').map(Number)
  return Math.abs((aHour * 60 + aMinute) - (bHour * 60 + bMinute))
}

function getTimePeriod(time: string) {
  const [hour] = time.split(':').map(Number)
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export function findClosestSlotToTime(
  time: string,
  slots: Array<{ start: string; end: string; label: string; date: string; time: string }>
): { start: string; end: string; label: string; date: string; time: string } | null {
  if (!slots.length) return null
  const targetPeriod = getTimePeriod(time)
  const samePeriodSlots = slots.filter((slot) => getTimePeriod(slot.time) === targetPeriod)
  const candidates = samePeriodSlots.length > 0 ? samePeriodSlots : slots

  return candidates.reduce((closest, slot) => {
    if (!closest) return slot
    return getTimeDistanceMinutes(slot.time, time) < getTimeDistanceMinutes(closest.time, time) ? slot : closest
  }, null as { start: string; end: string; label: string; date: string; time: string } | null)
}

export function matchTimeToSlot(
  time: string,
  slots: Array<{ start: string; end: string; label: string; date: string; time: string }>
): { start: string; end: string; label: string; date: string; time: string } | null {
  for (const slot of slots) {
    if (slot.time === time) return slot
  }
  return null
}

export function getOccupiedSlotTimesForDate(
  existingAppointments: ExistingAppointment[],
  date: Date,
  timezone = DEFAULT_TIMEZONE
): OccupiedSlotDayView {
  const requested = getZonedParts(date, timezone)
  const occupied = new Set<string>()

  const dayAppointments = existingAppointments.filter((appointment) => {
    if (appointment.status === 'cancelled' || appointment.status === 'no_show') return false
    const start = getZonedParts(new Date(appointment.start_time), timezone)
    return start.year === requested.year && start.month === requested.month && start.day === requested.day
  })

  dayAppointments.forEach((appointment) => {
    const start = getZonedParts(new Date(appointment.start_time), timezone)
    const end = getZonedParts(new Date(appointment.end_time), timezone)

    let currentHour = start.hour
    let currentMinute = start.minute

    while (currentHour < end.hour || (currentHour === end.hour && currentMinute < end.minute)) {
      occupied.add(`${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`)
      currentMinute += 30
      if (currentMinute >= 60) {
        currentHour += 1
        currentMinute = 0
      }
    }
  })

  return {
    occupied,
    appointmentCount: dayAppointments.length,
  }
}

export function isAppointmentOnDate(
  appointment: ExistingAppointment,
  date: Date,
  timezone = DEFAULT_TIMEZONE
) {
  if (appointment.status === 'cancelled' || appointment.status === 'no_show') return false
  const requested = getZonedParts(date, timezone)
  const start = getZonedParts(new Date(appointment.start_time), timezone)
  return start.year === requested.year && start.month === requested.month && start.day === requested.day
}

function toSlot(start: Date, end: Date, local: { year: number; month: number; day: number; hour: number; minute: number }): TimeSlot {
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const dayIndex = new Date(Date.UTC(local.year, local.month, local.day)).getUTCDay()
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `${dayNames[dayIndex]} ${local.day} ${monthNames[local.month]} · ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    date: `${local.year}-${String(local.month + 1).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`,
    time: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
  }
}

function collectDaySlots(
  existingAppointments: ExistingAppointment[],
  requestedStart: Date,
  params: AvailabilityParams,
  timezone: string
) {
  const {
    durationMinutes = 60,
    businessHourStart = 9,
    businessHourEnd = 19,
  } = params

  const occupied = existingAppointments
    .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
    .map((a) => ({ start: new Date(a.start_time).getTime(), end: new Date(a.end_time).getTime() }))

  const localRequested = getZonedParts(requestedStart, timezone)
  const slots: TimeSlot[] = []

  for (let hour = businessHourStart; hour < businessHourEnd; hour++) {
    for (const minute of [0, 30]) {
      const slotStart = zonedLocalToUtcDate({
        year: localRequested.year,
        month: localRequested.month - 1,
        day: localRequested.day,
        hour,
        minute,
      }, timezone)
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000)

      const slotEndLocal = getZonedParts(slotEnd, timezone)
      if (slotEndLocal.hour > businessHourEnd || (slotEndLocal.hour === businessHourEnd && slotEndLocal.minute > 0)) {
        continue
      }

      const hasOverlap = occupied.some((occ) => slotStart.getTime() < occ.end && slotEnd.getTime() > occ.start)
      if (hasOverlap) continue

      slots.push(toSlot(slotStart, slotEnd, {
        year: localRequested.year,
        month: localRequested.month - 1,
        day: localRequested.day,
        hour,
        minute,
      }))
    }
  }

  return slots
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

function zonedLocalToUtcDate(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string
) {
  let guess = new Date(Date.UTC(local.year, local.month, local.day, local.hour, local.minute))
  for (let i = 0; i < 3; i++) {
    const zoned = getZonedParts(guess, timeZone)
    const asIfUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute)
    const desired = Date.UTC(local.year, local.month, local.day, local.hour, local.minute)
    const diff = asIfUtc - desired
    if (diff === 0) break
    guess = new Date(guess.getTime() - diff)
  }
  return guess
}

export function suggestSlotsMessage(slots: TimeSlot[]): string {
  if (slots.length === 0) {
    return 'Lo sentimos, no hay disponibilidad en los próximos días. Nuestro equipo le contactará para coordinar una visita en el horario que mejor le convenga.'
  }

  const slotList = slots.map((s, i) => `  ${i + 1}. ${s.label}`).join('\n')
  return `Gracias por su interés en programar una visita. Estos son nuestros próximos horarios disponibles:\n\n${slotList}\n\n¿Le conviene alguno de estos horarios? Si prefiere otro momento, indíquenos su disponibilidad y buscaremos alternativa.`
}
