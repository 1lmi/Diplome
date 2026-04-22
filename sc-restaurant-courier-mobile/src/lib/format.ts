export const formatPrice = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

export const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatReadyAge = (value?: string | null) => {
  if (!value) return '';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 60) return `${Math.max(diffMinutes, 1)} мин ждёт`;
  return `${Math.floor(diffMinutes / 60)} ч ждёт`;
};
