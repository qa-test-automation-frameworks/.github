const HOUR = 3_600_000;

export function maxGapHours(expression) {
  const unsupported = () => { throw new Error(`Unsupported cron expression: ${expression}`); };
  if (typeof expression !== 'string') unsupported();
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) unsupported();
  function integer(value, minimum, maximum) {
    if (!/^(0|[1-9]\d*)$/.test(value)) unsupported();
    const number = Number(value);
    if (number < minimum || number > maximum) unsupported();
    return number;
  }
  function list(field, minimum, maximum, { star = false, range = false, step = false } = {}) {
    if (field === '*' && star) return new Set(Array.from({ length: maximum - minimum + 1 }, (_, i) => minimum + i));
    if (step && /^\*\/\d+$/.test(field)) {
      const interval = integer(field.slice(2), 1, maximum + 1);
      return new Set(Array.from({ length: maximum + 1 }, (_, i) => i).filter((i) => i % interval === 0));
    }
    const values = [];
    for (const part of field.split(',')) {
      if (range && /^\d+-\d+$/.test(part)) {
        const [start, end] = part.split('-').map((value) => integer(value, minimum, maximum));
        if (start > end) unsupported();
        for (let value = start; value <= end; value += 1) values.push(value);
      } else values.push(integer(part, minimum, maximum));
    }
    return new Set(values);
  }
  integer(fields[0], 0, 59);
  const hours = list(fields[1], 0, 23, { step: true });
  const days = list(fields[2], 1, 31, { star: true });
  const months = list(fields[3], 1, 12, { star: true });
  const weekdays = new Set([...list(fields[4], 0, 7, { star: true, range: true })].map((day) => day % 7));
  const start = Date.UTC(2026, 0, 1);
  let previous = null;
  let gap = 0;
  for (let index = 0; index < 730 * 24; index += 1) {
    const time = start + index * HOUR;
    const date = new Date(time);
    const dom = days.has(date.getUTCDate());
    const dow = weekdays.has(date.getUTCDay());
    const dayMatches = fields[2] !== '*' && fields[4] !== '*' ? dom || dow : dom && dow;
    if (!hours.has(date.getUTCHours()) || !months.has(date.getUTCMonth() + 1) || !dayMatches) continue;
    if (previous !== null) gap = Math.max(gap, (time - previous) / HOUR);
    previous = time;
  }
  if (gap === 0) unsupported();
  return gap;
}
