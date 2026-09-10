/**
 * Проверка корпуса: структура по schema/*.schema.json плюс правила, которые
 * одной схемой не выражаются (ссылочная целостность, полнота, календарь дат).
 *
 *   node scripts/validate-data.mjs      # или npm run validate
 *
 * Зависимостей нет намеренно: набор данных должен проверяться на голом Node.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

/* ------------------------------------------------------------------ *
 * Мини-валидатор JSON Schema: ровно то подмножество, которое
 * используется в schema/. Схемы остаются единственным местом,
 * где записаны enum-значения и обязательные поля.
 * ------------------------------------------------------------------ */
const schemas = {
  'common.schema.json': read('schema/common.schema.json'),
  'parties.schema.json': read('schema/parties.schema.json'),
  'candidates.schema.json': read('schema/candidates.schema.json'),
};

function resolveRef(ref, currentFile) {
  const [file, pointer] = ref.split('#');
  const target = file ? schemas[file] : schemas[currentFile];
  if (!target) throw new Error(`неизвестная схема: ${ref}`);
  const node = pointer.split('/').filter(Boolean).reduce((acc, key) => acc?.[key], target);
  if (!node) throw new Error(`не разрешается $ref: ${ref}`);
  return { node, file: file || currentFile };
}

function check(value, schema, file, where) {
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, file);
    return check(value, resolved.node, resolved.file, where);
  }
  if (schema.allOf) schema.allOf.forEach(sub => check(value, sub, file, where));

  const types = schema.type ? [schema.type].flat() : null;
  if (types) {
    const actual = value === null ? 'null'
      : Array.isArray(value) ? 'array'
      : Number.isInteger(value) ? 'integer'
      : typeof value;
    const ok = types.includes(actual) || (actual === 'integer' && types.includes('number'));
    if (!ok) return fail(where, `ожидался тип ${types.join('|')}, получен ${actual}`);
  }
  if (schema.const !== undefined && value !== schema.const) {
    fail(where, `ожидалось ${JSON.stringify(schema.const)}, получено ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    fail(where, `значение ${JSON.stringify(value)} вне списка [${schema.enum.join(', ')}]`);
  }
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      fail(where, `строка ${JSON.stringify(value)} не соответствует ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(where, 'строка короче допустимого');
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(where, `меньше ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(where, `больше ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(where, `нужно минимум ${schema.minItems} элемент(ов)`);
    }
    if (schema.items) value.forEach((item, i) => check(item, schema.items, file, `${where}[${i}]`));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      fail(where, `нужно минимум ${schema.minProperties} поле(й)`);
    }
    for (const key of schema.required ?? []) {
      if (!(key in value)) fail(where, `нет обязательного поля "${key}"`);
    }
    for (const [key, sub] of Object.entries(value)) {
      const propSchema = schema.properties?.[key];
      if (propSchema) check(sub, propSchema, file, `${where}.${key}`);
      else if (schema.additionalProperties === false) fail(where, `лишнее поле "${key}"`);
      else if (typeof schema.additionalProperties === 'object') {
        check(sub, schema.additionalProperties, file, `${where}.${key}`);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Правила поверх схемы
 * ------------------------------------------------------------------ */
const parties = read('public/parties.json');
const candidates = read('public/candidates.json');

check(parties, schemas['parties.schema.json'], 'parties.schema.json', 'parties.json');
check(candidates, schemas['candidates.schema.json'], 'candidates.schema.json', 'candidates.json');

const sourceIds = new Set(parties.sources.map(s => s.id));
const topicIds = new Set(parties.topics.map(t => t.id));
const topicById = new Map(parties.topics.map(t => [t.id, t]));
const usedSources = new Set();

const isRealDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/* Ссылочная целостность source_ids по всему корпусу. */
const walkSources = (node, where) => {
  if (Array.isArray(node)) return node.forEach((item, i) => walkSources(item, `${where}[${i}]`));
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node.source_ids)) {
    node.source_ids.forEach(id => {
      usedSources.add(id);
      if (!sourceIds.has(id)) fail(where, `ссылка на несуществующий источник "${id}"`);
    });
    /* Пустой список источников допустим только у явно зафиксированного пробела. */
    if (node.kind && node.kind !== 'uncertainty' && node.source_ids.length === 0) {
      fail(where, `утверждение kind:${node.kind} без источников — понизьте до uncertainty или дайте ссылку`);
    }
  }
  Object.entries(node).forEach(([key, sub]) => walkSources(sub, `${where}.${key}`));
};
walkSources(parties, 'parties.json');
walkSources(candidates, 'candidates.json');

/* Источники: даты, календарь, отсутствие мусора в каталоге. */
if (!isRealDate(parties.meta.as_of)) fail('parties.json.meta.as_of', 'не календарная дата');
for (const source of parties.sources) {
  const where = `parties.json.sources[${source.id}]`;
  if (!isRealDate(source.accessed_at)) fail(where, 'accessed_at не календарная дата');
  if (source.date_kind === 'accessed_only' && source.published_at !== null) {
    fail(where, 'date_kind accessed_only требует published_at: null');
  }
  if (source.date_kind === 'month' && !/^\d{4}-\d{2}$/.test(source.published_at ?? '')) {
    fail(where, 'date_kind month требует published_at вида YYYY-MM');
  }
  if (source.date_kind === 'exact') {
    if (!isRealDate(source.published_at ?? '')) fail(where, 'date_kind exact требует полную календарную дату');
    else if (source.published_at > source.accessed_at) fail(where, 'публикация позже даты проверки');
  }
  if (source.accessed_at > parties.meta.as_of) fail(where, 'дата проверки позже meta.as_of');
  if (!usedSources.has(source.id)) fail(where, 'источник не используется ни одним утверждением');
}

/* Партии: полнота позиций, словарь value, соответствие спискам кандидатов. */
const partyIds = new Set();
for (const party of parties.parties) {
  const where = `parties.json.parties[${party.id}]`;
  if (partyIds.has(party.id)) fail(where, 'дублирующийся id партии');
  partyIds.add(party.id);

  const covered = new Set();
  for (const position of party.positions) {
    const at = `${where}.positions[${position.topic}]`;
    if (!topicIds.has(position.topic)) fail(at, `тема "${position.topic}" отсутствует в topics`);
    if (covered.has(position.topic)) fail(at, 'тема встречается дважды');
    covered.add(position.topic);
    if (position.value === position.topic) fail(at, `значение "${position.value}" повторяет имя темы`);
    if ((position.value === 'unknown') !== (position.kind === 'uncertainty')) {
      fail(at, 'value:unknown и kind:uncertainty должны стоять только вместе');
    }
    if (position.value !== 'unknown' && !topicById.get(position.topic)?.values?.[position.value]) {
      fail(at, `нет подписи для значения "${position.value}" в topics[${position.topic}].values`);
    }
  }
  for (const topic of topicIds) if (!covered.has(topic)) fail(where, `нет позиции по теме "${topic}"`);


  const list = candidates.parties[party.id];
  if (!list) { fail(where, 'нет списка кандидатов в candidates.json'); continue; }
  if (list.length !== party.audit_depth) {
    fail(where, `audit_depth ${party.audit_depth} не равен длине списка ${list.length}`);
  }
}
for (const key of Object.keys(candidates.parties)) {
  if (!partyIds.has(key)) fail(`candidates.json.parties.${key}`, 'нет такой партии в parties.json');
}

/* Кандидаты: уникальные id, сплошная нумерация мест, темы критериев. */
const candidateIds = new Set();
for (const [partyId, list] of Object.entries(candidates.parties)) {
  const positions = new Set();
  for (const candidate of list) {
    const where = `candidates.json.parties.${partyId}[${candidate.id}]`;
    if (candidateIds.has(candidate.id)) fail(where, 'дублирующийся id кандидата');
    candidateIds.add(candidate.id);
    if (positions.has(candidate.position)) fail(where, `место ${candidate.position} занято дважды`);
    positions.add(candidate.position);
    for (const note of candidate.criteria) {
      if (!topicIds.has(note.topic)) fail(where, `критерий ссылается на неизвестную тему "${note.topic}"`);
    }
  }
  for (let i = 1; i <= list.length; i += 1) {
    if (!positions.has(i)) fail(`candidates.json.parties.${partyId}`, `в нумерации мест пропуск: нет места ${i}`);
  }
}

/* ------------------------------------------------------------------ *
 * Редакционный фильтр
 *
 * Корпус открыт для правок, поэтому часть редакционной модели проверяется
 * машиной, а не только на ревью. Две вещи ловятся здесь: оценочная лексика
 * о людях и партиях и тексты, вылезающие за формат карточки.
 *
 * Фильтр не заменяет ревью и не судит о правоте: он снимает самый
 * дешёвый способ протащить агитацию: назвать человека словом вместо разбора эпизода.
 * ------------------------------------------------------------------ */

/* Слово запрещено в собственной речи проекта целиком, вместе с формами. */
const STOP_STEMS = [
  'популист', 'экстремист', 'предател', 'изменник', 'фашист', 'нацист',
  'марионетк', 'коррупционер', 'продажн', 'ничтожн', 'бездарн',
  'жулик', 'проходимец', 'выскочк', 'клоун', 'русофоб', 'сионофоб',
  'мразь', 'подонок', 'ублюдок', 'тварь',
];

/* Оценочные формы, у которых есть безобидные однокоренные слова
   («безопасность» рядом с «опасный»), поэтому сравнение точное. */
const STOP_WORDS = [
  'опасный', 'опасен', 'опасная', 'опасное', 'опасные', 'опасных',
  'надёжный', 'надежный', 'ненадёжный', 'ненадежный', 'надёжен', 'надежен',
  'герой', 'героя', 'герои', 'героем',
  'лучший', 'лучшая', 'лучшее', 'лучшие', 'худший', 'худшая', 'худшие',
  'единственный', 'единственная', 'единственное', 'единственные',
  'радикал', 'радикалы', 'радикала',
  'преступник', 'преступники',
];

/* Потолки длины: не стилистика, а защита от манифеста в поле карточки.
   Рекомендованные в docs/AGENT-DATA-GUIDE.md значения строже. */
const LENGTH_LIMIT = {
  text: 280,
  summary: 320,
  bio: 140,
  descriptor: 70,
  title: 90,
  label: 70,
  note: 200,
  status: 200,
};

const tokenize = value => value.toLowerCase().split(/[^a-zа-яё0-9-]+/i).filter(Boolean);

const editorialWalk = (node, where) => {
  if (Array.isArray(node)) return node.forEach((item, i) => editorialWalk(item, `${where}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node).forEach(([key, value]) => editorialWalk(value, `${where}.${key}`));
  }
  if (typeof node !== 'string') return;

  for (const token of tokenize(node)) {
    if (STOP_WORDS.includes(token) || STOP_STEMS.some(stem => token.startsWith(stem))) {
      fail(where, `оценочное слово «${token}»: оценка допустима только к конкретному эпизоду и только с источником, а не как ярлык`);
    }
  }

  const field = where.split('.').pop().replace(/\[\d+\]$/, '');
  const limit = LENGTH_LIMIT[field];
  if (limit && node.length > limit) {
    fail(where, `поле "${field}" длиной ${node.length} символов при потолке ${limit}`);
  }
};

editorialWalk(parties, 'parties.json');
editorialWalk(candidates, 'candidates.json');

/* Ссылка на источник должна открываться по защищённому протоколу. */
for (const source of parties.sources) {
  if (!source.url.startsWith('https://')) {
    fail(`parties.json.sources[${source.id}]`, 'ссылка не по https');
  }
}

/* Наборы должны описывать один и тот же срез времени. */
if (parties.meta.as_of !== candidates.meta.as_of) {
  fail('meta.as_of', `parties.json (${parties.meta.as_of}) и candidates.json (${candidates.meta.as_of}) описывают разные даты`);
}

if (errors.length) {
  console.error(`Проверка данных провалена, ошибок: ${errors.length}\n`);
  errors.forEach(message => console.error(`  ✗ ${message}`));
  process.exit(1);
}

const claimCount = JSON.stringify([parties, candidates]).match(/"kind":/g)?.length ?? 0;
console.log(
  `Проверка данных пройдена: ${parties.parties.length} списков, ` +
  `${Object.values(candidates.parties).flat().length} кандидатов, ` +
  `${parties.sources.length} источников, ${claimCount} утверждений.`,
);
