/**
 * Единственная точка входа в корпус. Данные живут в `public/*.json`:
 * тот же файл отдаётся читателю по прямой ссылке и импортируется приложением,
 * поэтому расхождению между «сайтом» и «набором данных» взяться неоткуда.
 *
 * Здесь же собран весь словарь терминов: подписи статусов, типов источников
 * и глоссарий интерфейса. Правится в одном месте — меняется везде.
 */
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import partiesData from '../public/parties.json';
import candidatesData from '../public/candidates.json';

export type Kind = 'fact' | 'position' | 'assessment' | 'uncertainty';
export type Verification = 'verified' | 'partial' | 'unverified';
export type Confidence = 'confirmed' | 'limited';
export type Color = 'red' | 'yellow' | 'green';
export type ProfileDepth = 'substantive' | 'basic' | 'limited';

export type Claim = {
  text: string;
  kind: Kind;
  source_ids: string[];
  verification: Verification;
  confidence: Confidence;
  event_date?: string;
};

export type Flag = Claim & { color: Color; title: string };
export type ProfileClaim = Claim & { title: string; color?: Color };
export type CriterionNote = Claim & { topic: string; label: string };
export type TrustNote = Claim & { label: string };
export type Position = Claim & { topic: string; value: string };

export type Axis = { low: string; high: string; order: string[]; note: string };
export type Topic = { id: string; label: string; values: Record<string, string>; axis?: Axis };

export type Source = {
  id: string;
  title: string;
  url: string;
  published_at: string | null;
  accessed_at: string;
  type: string;
  date_kind: 'exact' | 'month' | 'accessed_only';
  language?: string;
};

export type Party = {
  id: string;
  name_he: string;
  name_ru: string;
  leaders: string[];
  descriptor: string;
  control: boolean;
  color: string;
  default_seats: number;
  audit_depth: number;
  positions: Position[];
  trust_risk: Claim;
  flags: Flag[];
};

export type Candidate = {
  id: string;
  position: number;
  name: string;
  name_he?: string;
  bio: string;
  summary: string;
  profile_depth: ProfileDepth;
  source_ids: string[];
  verification: Verification;
  confidence: Confidence;
  strengths: ProfileClaim[];
  concerns: ProfileClaim[];
  criteria: CriterionNote[];
  trust_notes: TrustNote[];
  unknowns: string[];
};

export type Meta = {
  as_of: string;
  lists: { submitted_from: string; submitted_to: string; status: string; source_ids: string[] };
  poll: {
    name: string;
    conducted_at: string;
    published_at: string;
    note: string;
    source_ids: string[];
  };
};

type PartiesFile = { schema_version: string; meta: Meta; topics: Topic[]; sources: Source[]; parties: Party[] };
type CandidatesFile = { schema_version: string; meta: { as_of: string }; parties: Record<string, Candidate[]> };

const partiesFile = partiesData as unknown as PartiesFile;
const candidatesFile = candidatesData as unknown as CandidatesFile;

export const meta = partiesFile.meta;
export const topics = partiesFile.topics;
export const sources = partiesFile.sources;
export const parties = partiesFile.parties;
export const candidatesByParty = candidatesFile.parties;

const sourceIndex = new Map(sources.map(source => [source.id, source]));
const topicIndex = new Map(topics.map(topic => [topic.id, topic]));
const partyIndex = new Map(parties.map(party => [party.id, party]));

export const sourceById = (id: string): Source | undefined => sourceIndex.get(id);
export const topicById = (id: string): Topic | undefined => topicIndex.get(id);
export const partyById = (id: string): Party | undefined => partyIndex.get(id);

export const allCandidates: { party: Party; candidate: Candidate }[] = parties.flatMap(party =>
  (candidatesByParty[party.id] ?? []).map(candidate => ({ party, candidate })),
);

/** Сколько разных публикаций стоит за корпусом (один сайт = один источник). */
export const distinctSourceCount = new Set(sources.map(source => source.url)).size;

/** Верхняя граница сценария мандатов: одинаковая для всех списков, чтобы их можно было сравнивать. */
export const MAX_SEATS = 40;

/* ------------------------------------------------------------------ *
 * Словарь интерфейса
 * ------------------------------------------------------------------ */

export const KIND_LABEL: Record<Kind, string> = {
  fact: 'Факт',
  position: 'Позиция / обещание',
  assessment: 'Оценка редакции',
  uncertainty: 'Не установлено',
};

export const VERIFICATION_LABEL: Record<Verification, string> = {
  verified: 'проверено по источнику',
  partial: 'проверено частично',
  unverified: 'источник не найден',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: 'подтверждено',
  limited: 'подтверждение ограничено',
};

export const DEPTH_LABEL: Record<ProfileDepth, string> = {
  substantive: 'подробное досье',
  basic: 'базовое досье',
  limited: 'мало данных',
};

export const COLOR_LABEL: Record<Color, string> = {
  green: 'подтверждающий поступок',
  yellow: 'спорный эпизод',
  red: 'эпизод с высоким риском',
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  institutional_media: 'Парламентский канал',
  media: 'СМИ',
  news: 'Новостное агентство',
  analysis: 'Аналитика',
  research: 'Исследовательский институт',
  poll: 'Опрос',
  party: 'Материал партии',
  interview: 'Интервью',
  investigation: 'Расследование',
};

/** Порядок групп в списке источников: от первичного к вторичному. */
export const SOURCE_TYPE_ORDER = [
  'institutional_media',
  'party',
  'interview',
  'investigation',
  'news',
  'media',
  'poll',
  'research',
  'analysis',
];

/**
 * Глоссарий интерфейса. Ключ используется компонентом `Term`,
 * который подчёркивает слово и показывает определение в тултипе.
 */
export const GLOSSARY: Record<string, string> = {
  control:
    'Контрольный вариант — список, взятый для контраста с остальными. Это приём сравнения, а не рекомендация и не оценка.',
  audit:
    'Проверены досье — места списка, для которых биографический аудит уже проведён. Ниже этой границы досье ещё нет.',
  trust:
    'Риск доверия — редакционная оценка того, насколько заявленная линия списка расходится с его собственными прошлыми действиями.',
  scenario:
    'Сценарий мандатов — число мест, которое вы задаёте сами, чтобы прочитать список. Это не прогноз и не вероятность результата.',
  unknown:
    'Не установлено — мы искали, но не нашли достаточно ясной позиции или источника. Пробел сохранён как результат, а не заполнен предположением.',
  depth:
    'Глубина досье — сколько публичного материала удалось собрать: подробное досье, базовое или мало данных.',
  colors:
    'Цвет относится к конкретному эпизоду, а не к человеку целиком: зелёный — подтверждающий поступок, жёлтый — спорный эпизод, красный — эпизод с высоким риском.',
  threshold:
    'Ниже барьера — по опросу список не набирает электоральный минимум. Это состояние опроса, а не итог выборов.',
};

/* ------------------------------------------------------------------ *
 * Форматирование
 * ------------------------------------------------------------------ */

/**
 * Русское числительное: 1 эпизод, 2 эпизода, 5 эпизодов.
 * Формы собирались по месту и ломались при первом же изменении данных —
 * количество источников и критериев меняется вместе с корпусом.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = mod100 % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Единый формат дат в интерфейсе: «10 сент. 2026». */
export function formatDate(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) return format(parseISO(`${value}-01`), 'LLLL yyyy', { locale: ru });
  return format(parseISO(value), 'd MMM yyyy', { locale: ru });
}

/** Подпись даты источника: если публикация не установлена, показываем только проверку. */
export function sourceDateLine(source: Source): string {
  if (source.date_kind === 'accessed_only') return `проверено ${formatDate(source.accessed_at)}`;
  return `${formatDate(source.published_at as string)} · проверено ${formatDate(source.accessed_at)}`;
}

/** Короткая подпись позиции для матрицы. */
export function valueLabel(position: Position): string {
  if (position.value === 'unknown') return KIND_LABEL.uncertainty;
  return topicById(position.topic)?.values[position.value] ?? position.value;
}

/** Темы, у которых объявлена шкала, в порядке `topics`. */
export const scaledTopics: (Topic & { axis: Axis })[] = topics.filter(
  (topic): topic is Topic & { axis: Axis } => Boolean(topic.axis),
);

/**
 * Место позиции на шкале темы: 0 — полюс `low`, 1 — полюс `high`.
 * Считается из порядкового номера, а не из придуманных весов: `order`
 * утверждает последовательность значений и ничего не говорит о том,
 * насколько одна ступень дальше другой. `null` — позиция не установлена.
 */
export function axisPosition(topic: Topic & { axis: Axis }, position: Position): number | null {
  const index = topic.axis.order.indexOf(position.value);
  if (index < 0) return null;
  return index / (topic.axis.order.length - 1);
}

/** Утверждение считается неустановленным, если это пробел или если проверка не завершена. */
export function isUnsettled(claim: Pick<Claim, 'kind' | 'verification'>): boolean {
  return claim.kind === 'uncertainty' || claim.verification !== 'verified';
}

/**
 * Цвет строки кандидата в списке: берём самый серьёзный отмеченный эпизод.
 * Отдельного массива `flags` у кандидата нет — цвет живёт на самом утверждении.
 */
export function candidateMark(candidate: Candidate): Color | null {
  const colors = [...candidate.concerns, ...candidate.strengths]
    .map(claim => claim.color)
    .filter((color): color is Color => Boolean(color));
  if (colors.includes('red')) return 'red';
  if (colors.includes('yellow')) return 'yellow';
  if (colors.includes('green')) return 'green';
  return null;
}
