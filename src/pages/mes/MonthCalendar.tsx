import { calendarWeeks, todayIso, WEEKDAY_SHORT, type MonthKey } from '../../lib/dates'
import { FORMAT_LABELS, type PieceSummary } from '../../lib/pieces'
import { STATUS_DOT } from './statusColors'

// Calendario mensual (lunes a domingo). En la compu muestra el título de cada
// pieza; en el celular, puntos de color y la cantidad. Tocar un día muestra
// sus piezas debajo.
export function MonthCalendar({
  month,
  piecesByDay,
  selectedDay,
  onSelectDay,
}: {
  month: MonthKey
  piecesByDay: Map<string, PieceSummary[]>
  selectedDay: string | null
  onSelectDay: (iso: string | null) => void
}) {
  const today = todayIso()
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-iris-lilac">
      <div className="grid grid-cols-7 border-b border-iris-lilac bg-iris-cream text-center text-xs font-bold uppercase">
        {WEEKDAY_SHORT.map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>
      {calendarWeeks(month).map((week) => (
        <div key={week[0].iso} className="grid grid-cols-7 border-b border-iris-lilac last:border-b-0">
          {week.map((day) => {
            const pieces = day.inMonth ? (piecesByDay.get(day.iso) ?? []) : []
            const selected = selectedDay === day.iso
            return (
              <button
                key={day.iso}
                type="button"
                disabled={!day.inMonth}
                onClick={() => onSelectDay(selected ? null : day.iso)}
                aria-pressed={selected}
                aria-label={`${day.day}${pieces.length ? `, ${pieces.length} pieza${pieces.length === 1 ? '' : 's'}` : ''}`}
                className={`flex min-h-14 flex-col items-stretch justify-start border-r border-iris-lilac p-1 text-left last:border-r-0 sm:min-h-28 sm:p-1.5 ${
                  day.inMonth ? 'hover:bg-iris-cream' : 'bg-iris-cream/60 text-iris-violet/30'
                } ${selected ? 'bg-iris-lilac/60 ring-2 ring-inset ring-iris-violet' : ''}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    day.inMonth && day.iso === today ? 'bg-iris-violet text-white' : ''
                  }`}
                >
                  {day.day}
                </span>
                {pieces.length > 0 && (
                  <>
                    <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                      {pieces.slice(0, 4).map((piece) => (
                        <span key={piece.id} className={`h-2 w-2 rounded-full ${STATUS_DOT[piece.status]}`} />
                      ))}
                    </span>
                    <span className="mt-1 hidden space-y-1 sm:block">
                      {pieces.slice(0, 3).map((piece) => (
                        <span
                          key={piece.id}
                          className="block truncate rounded-md bg-iris-lilac/70 px-1.5 py-0.5 text-[11px] font-semibold"
                          title={piece.title}
                        >
                          {FORMAT_LABELS[piece.format]} · {piece.title}
                        </span>
                      ))}
                      {pieces.length > 3 && (
                        <span className="block text-[11px] font-semibold text-iris-violet/70">
                          +{pieces.length - 3} más
                        </span>
                      )}
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
