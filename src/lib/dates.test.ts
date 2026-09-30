import { describe, expect, it } from 'vitest'
import { addMonths, calendarWeeks, capitalizeFirst, currentMonthKey, dayLabel, isMonthKey, monthLabel, monthStartIso } from './dates'

describe('fechas del calendario', () => {
  it('valida el formato de mes de la dirección', () => {
    expect(isMonthKey('2026-10')).toBe(true)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-1')).toBe(false)
    expect(isMonthKey(undefined)).toBe(false)
  })

  it('suma y resta meses cruzando el año', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', 0)).toBe('2026-10')
  })

  it('arma el día 1 que usa monthly_plans.month', () => {
    expect(monthStartIso('2026-10')).toBe('2026-10-01')
  })

  it('nombra meses y días en español', () => {
    expect(monthLabel('2026-10')).toBe('octubre 2026')
    expect(dayLabel('2026-10-01')).toBe('jue 1 de octubre')
    expect(capitalizeFirst(dayLabel('2026-10-14'))).toBe('Mié 14 de octubre')
  })

  it('usa el mes local de hoy', () => {
    expect(currentMonthKey(new Date(2026, 8, 30))).toBe('2026-09')
  })

  it('arma semanas de lunes a domingo que cubren todo el mes', () => {
    const weeks = calendarWeeks('2026-10') // 1/10/2026 es jueves
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks[0][0]).toEqual({ iso: '2026-09-28', day: 28, inMonth: false })
    expect(weeks[0][3]).toEqual({ iso: '2026-10-01', day: 1, inMonth: true })
    const inMonth = weeks.flat().filter((d) => d.inMonth)
    expect(inMonth).toHaveLength(31)
    expect(inMonth[30].iso).toBe('2026-10-31')
  })

  it('febrero de año no bisiesto que empieza en lunes ocupa 4 semanas', () => {
    expect(calendarWeeks('2027-02')).toHaveLength(4)
  })
})
