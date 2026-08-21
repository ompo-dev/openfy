import { getDisplayTime } from '../common';

type CollectionMetaInput = {
  createdAt?: string;
  trackCount: number;
  totalDurationMs: number;
};

const formatCreatedAt = (value?: string) => {
  if (!value || Number.isNaN(Date.parse(value))) return '';

  const date = new Date(value);
  const monthYear = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(date)
    .replace(/\sde\s/g, ' ');

  return `${date.getUTCDate()} ${monthYear}`;
};

export const formatCollectionMeta = ({
  createdAt,
  trackCount,
  totalDurationMs,
}: CollectionMetaInput) =>
  [
    formatCreatedAt(createdAt),
    `${trackCount} ${trackCount === 1 ? 'música' : 'músicas'}`,
    totalDurationMs > 0 ? getDisplayTime(totalDurationMs) : '',
  ]
    .filter(Boolean)
    .join(' • ');
