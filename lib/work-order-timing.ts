export type WorkOrderTiming = {
  phase: 'unscheduled' | 'upcoming' | 'active' | 'ended';
  days: number | null;
  label: string;
  compactLabel: string;
  tone: 'neutral' | 'warning' | 'success' | 'muted';
  progressPercent: number | null;
  totalDays: number | null;
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function todayUtc() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

const DAY = 86_400_000;

export function getWorkOrderTiming(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): WorkOrderTiming {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const today = todayUtc();
  const totalDays = start !== null && end !== null && end >= start
    ? Math.round((end - start) / DAY)
    : null;

  if (!start && !end) {
    return {
      phase: 'unscheduled',
      days: null,
      label: 'المدة غير محددة',
      compactLabel: 'غير مجدول',
      tone: 'neutral',
      progressPercent: null,
      totalDays,
    };
  }

  if (start !== null && today < start) {
    const days = Math.ceil((start - today) / DAY);
    return {
      phase: 'upcoming',
      days,
      label: days === 1 ? 'يبدأ غدًا' : `يبدأ بعد ${days} يوم`,
      compactLabel: days === 1 ? 'يبدأ غدًا' : `بعد ${days} يوم`,
      tone: days <= 30 ? 'warning' : 'neutral',
      progressPercent: 0,
      totalDays,
    };
  }

  if (end !== null && today <= end) {
    const days = Math.ceil((end - today) / DAY);
    const progressPercent = start !== null && totalDays !== null && totalDays > 0
      ? Math.min(100, Math.max(0, Math.round(((today - start) / (end - start)) * 100)))
      : null;
    return {
      phase: 'active',
      days,
      label: days === 0 ? 'ينتهي اليوم' : days === 1 ? 'متبقٍ يوم واحد' : `متبقٍ ${days} يوم`,
      compactLabel: days === 0 ? 'ينتهي اليوم' : `متبقٍ ${days} يوم`,
      tone: days <= 7 ? 'warning' : 'success',
      progressPercent,
      totalDays,
    };
  }

  if (end !== null && today > end) {
    const days = Math.floor((today - end) / DAY);
    return {
      phase: 'ended',
      days,
      label: days === 1 ? 'انتهى منذ يوم' : `انتهى منذ ${days} يوم`,
      compactLabel: 'منتهي',
      tone: 'muted',
      progressPercent: 100,
      totalDays,
    };
  }

  return {
    phase: 'active',
    days: null,
    label: 'أمر عمل جارٍ',
    compactLabel: 'جارٍ',
    tone: 'success',
    progressPercent: null,
    totalDays,
  };
}

export function calculateDurationDays(startDate: string | null | undefined, endDate: string | null | undefined) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start === null || end === null || end < start) return null;
  return Math.round((end - start) / DAY);
}
