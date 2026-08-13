interface CustomDateRangePickerProps {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}

export function CustomDateRangePicker({
  start,
  end,
  onStartChange,
  onEndChange,
}: CustomDateRangePickerProps) {
  function handleStartChange(value: string) {
    if (!value) return;
    onStartChange(value);
    if (value > end) onEndChange(value);
  }

  function handleEndChange(value: string) {
    if (!value) return;
    onEndChange(value);
    if (value < start) onStartChange(value);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        De
        <input
          type="date"
          aria-label="Data inicial"
          value={start}
          max={end}
          onChange={(event) => handleStartChange(event.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm font-normal text-gray-700 outline-none focus:border-primary"
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        Até
        <input
          type="date"
          aria-label="Data final"
          value={end}
          min={start}
          onChange={(event) => handleEndChange(event.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm font-normal text-gray-700 outline-none focus:border-primary"
        />
      </label>
    </div>
  );
}
