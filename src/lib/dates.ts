// Fechas del calendario mensual. Todo se maneja como texto "AAAA-MM-DD" y
// "AAAA-MM" para evitar corrimientos por zona horaria (las fechas de las
// piezas son estimativas y no tienen hora).

export type MonthKey = string // "2026-10"

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export const WEEKDAY_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

const pad = (n: number) => String(n).padStart(2, '0')

export function isMonthKey(value: string | undefined): value is MonthKey {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false
  const month = Number(value.slice(5, 7))
  return month >= 1 && month <= 12
}

export function currentMonthKey(today: Date = new Date()): MonthKey {
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}`
}

export function todayIso(today: Date = new Date()): string {
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
}

function parts(key: MonthKey): [number, number] {
  return [Number(key.slice(0, 4)), Number(key.slice(5, 7))]
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const [year, month] = parts(key)
  const index = year * 12 + (month - 1) + delta
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

// Día 1 del mes, como lo guarda monthly_plans.month.
export function monthStartIso(key: MonthKey): string {
  return `${key}-01`
}

export function monthLabel(key: MonthKey): string {
  const [year, month] = parts(key)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const weekday = WEEKDAY_SHORT[(new Date(year, month - 1, day).getDay() + 6) % 7]
  return `${weekday} ${day} de ${MONTH_NAMES[month - 1]}`
}

export type CalendarDay = { iso: string; day: number; inMonth: boolean }

// Semanas completas (lunes a domingo) que cubren el mes.
export function calendarWeeks(key: MonthKey): CalendarDay[][] {
  const [year, month] = parts(key)
  const first = new Date(year, month - 1, 1)
  const offset = (first.getDay() + 6) % 7 // lunes = 0
  const daysInMonth = new Date(year, month, 0).getDate()
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7

  const weeks: CalendarDay[][] = []
  for (let cell = 0; cell < totalCells; cell++) {
    const date = new Date(year, month - 1, 1 - offset + cell)
    const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    if (cell % 7 === 0) weeks.push([])
    weeks[weeks.length - 1].push({ iso, day: date.getDate(), inMonth: date.getMonth() === month - 1 })
  }
  return weeks
}

// "mié 14 de octubre" → "Mié 14 de octubre" (para títulos).
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
