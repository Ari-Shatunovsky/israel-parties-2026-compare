'use client';

import { useMemo } from 'react';
import {
  AlertCircle, ArrowUpRight, BookOpen, CheckCircle2, ChevronRight,
  ChevronDown, CircleHelp, Database, Filter, Search, ShieldCheck, Users, X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  allCandidates, candidateMark, candidatesByParty, CONFIDENCE_LABEL, COLOR_LABEL,
  DEPTH_LABEL, distinctSourceCount, formatDate, GLOSSARY, isUnsettled, KIND_LABEL,
  axisPosition, MAX_SEATS, meta, parties, partyById, scaledTopics, sourceById,
  sourceDateLine, sources, SOURCE_TYPE_LABEL, SOURCE_TYPE_ORDER, topicById, topics,
  valueLabel, VERIFICATION_LABEL,
  type Axis, type Candidate, type Claim, type Color, type CriterionNote, type Flag,
  type Party, type Position, type ProfileClaim, type Topic, type TrustNote,
} from '@/lib/corpus';
import { useUrlState } from '@/lib/use-url-state';

const flagStyle: Record<Color, string> = {
  red: 'border-red-200 bg-red-50 text-red-900',
  yellow: 'border-amber-200 bg-amber-50 text-amber-950',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-950',
};

/* ------------------------------------------------------------------ *
 * Мелкие общие блоки
 * ------------------------------------------------------------------ */

/** Термин из глоссария: пунктирное подчёркивание плюс определение в тултипе. */
function Term({ name, children }: { name: string; children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" className="term" aria-label={`${children}: определение`} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent className="glossary-tip">{GLOSSARY[name]}</TooltipContent>
    </Tooltip>
  );
}

function SourceLinks({ ids, compact = false }: { ids: string[]; compact?: boolean }) {
  if (!ids?.length) return <span className="uncertain">Прямого источника нет</span>;
  return (
    <span className={compact ? 'source-row compact' : 'source-row'}>
      {ids.map(id => sourceById(id)).filter(Boolean).map(source => (
        <a key={source!.id} href={source!.url} target="_blank" rel="noreferrer" title={source!.title}>
          {compact ? '↗' : source!.title}
          <span className="sr-only"> (откроется в новой вкладке)</span>
        </a>
      ))}
    </span>
  );
}

/**
 * Тег доказательства. Сам тег отвечает на вопрос «что это за утверждение»,
 * тултип — на вопрос «насколько оно проверено»: там живут `verification`
 * и `confidence`, которые иначе остались бы только в JSON.
 */
function EvidenceTag({ claim }: { claim: Pick<Claim, 'kind' | 'verification' | 'confidence'> }) {
  const unsettled = isUnsettled(claim);
  const tone = unsettled ? 'uncertain' : claim.kind === 'assessment' ? 'assessment' : 'fact';
  const Icon = unsettled ? CircleHelp : claim.kind === 'assessment' ? AlertCircle : CheckCircle2;
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <button
            type="button"
            className={`evidence-tag evidence-${tone}`}
            aria-label={`${KIND_LABEL[claim.kind]}, ${VERIFICATION_LABEL[claim.verification]}, ${CONFIDENCE_LABEL[claim.confidence]}`}
          />
        )}
      >
        <Icon size={13} />
        {unsettled ? KIND_LABEL.uncertainty : KIND_LABEL[claim.kind]}
      </TooltipTrigger>
      <TooltipContent className="glossary-tip">
        <span>
          <b>{KIND_LABEL[claim.kind]}</b>
          <br />
          {VERIFICATION_LABEL[claim.verification]} · {CONFIDENCE_LABEL[claim.confidence]}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function MarkDot({ color }: { color: Color }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" className={`dot dot-${color}`} aria-label={COLOR_LABEL[color]} />}
      />
      <TooltipContent className="glossary-tip">{COLOR_LABEL[color]}</TooltipContent>
    </Tooltip>
  );
}

function FlagBlock({ flag }: { flag: Flag }) {
  return (
    <div className={`flag-block ${flagStyle[flag.color]}`}>
      <div className="flag-head"><strong>{flag.title}</strong><EvidenceTag claim={flag} /></div>
      <p>{flag.text}</p>
      <SourceLinks ids={flag.source_ids} compact />
    </div>
  );
}

function ClaimBlock({ item, tone }: { item: ProfileClaim; tone: 'positive' | 'caution' }) {
  return (
    <article className={`profile-claim profile-claim-${tone}`}>
      <div className="profile-claim-head">
        <strong>{item.title}</strong>
        <span className="claim-marks">
          {item.color && <MarkDot color={item.color} />}
          <EvidenceTag claim={item} />
        </span>
      </div>
      <p>{item.text}</p>
      {item.source_ids?.length > 0 && <SourceLinks ids={item.source_ids} />}
    </article>
  );
}

function NoteList({ items }: { items: (CriterionNote | TrustNote)[] }) {
  return (
    <div className="criteria-notes">
      {items.map((note, i) => (
        <article key={i}>
          <div><span>{note.label}</span><EvidenceTag claim={note} /></div>
          <p>{note.text}</p>
          {note.source_ids?.length > 0 && <SourceLinks ids={note.source_ids} />}
        </article>
      ))}
    </div>
  );
}

/** Мандаты по опросу: число ведёт на сам опрос, ноль читается как «ниже барьера». */
function SeatsBadge({ party, size }: { party: Party; size: 'card' | 'row' }) {
  const poll = sourceById(meta.poll.source_ids[0]);
  const belowThreshold = party.default_seats === 0;
  return (
    <a
      className={`seats seats-${size} ${belowThreshold ? 'seats-below' : ''}`}
      href={poll?.url}
      target="_blank"
      rel="noreferrer"
      title={
        belowThreshold
          ? `${GLOSSARY.threshold} ${meta.poll.name}, ${formatDate(meta.poll.conducted_at)}`
          : `${meta.poll.name}, ${formatDate(meta.poll.conducted_at)}`
      }
    >
      <b>{belowThreshold ? 'ниже барьера' : party.default_seats}</b>
      <span>{belowThreshold ? 'по опросу' : 'мест по опросу'}<br />{meta.poll.name}</span>
    </a>
  );
}

/* ------------------------------------------------------------------ *
 * Карточки
 * ------------------------------------------------------------------ */

function PartyCard({
  party, index, checked, toggle, topic, onOpen,
}: {
  party: Party; index: number; checked: boolean; toggle: () => void; topic: string; onOpen: () => void;
}) {
  const position = party.positions.find(p => p.topic === topic)!;
  return (
    <article
      className={`party-card ${checked ? '' : 'party-card-muted'}`}
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="card-rule" style={{ background: party.color }} />
      <div className="party-card-top">
        <label className="party-check" htmlFor={`compare-${party.id}`}>
          <Checkbox
            id={`compare-${party.id}`}
            checked={checked}
            onCheckedChange={toggle}
            aria-label={`Показывать ${party.name_ru} в сравнении и в матрице`}
          />
          <span>в сравнении</span>
        </label>
        {party.control && <span className="control-badge"><Term name="control">контрольный вариант</Term></span>}
      </div>
      <div className="party-title-row">
        <div className="party-title">
          <div className="hebrew" lang="he" dir="rtl">{party.name_he}</div>
          <h2>{party.name_ru}</h2>
        </div>
        <SeatsBadge party={party} size="card" />
      </div>
      <p className="descriptor">{party.descriptor}</p>
      <p className="leaders">{party.leaders.join(' · ')}</p>
      <div className="card-position">
        <span className="micro-label">{topicById(topic)?.label}</span>
        <p>{position.text}</p>
        <div className="claim-footer">
          <EvidenceTag claim={position} />
          <SourceLinks ids={position.source_ids} compact />
        </div>
      </div>
      <div className="card-actions">
        <button type="button" className="text-button" onClick={onOpen}>
          Все {topics.length} позиций · доверие: {party.flags.length}{' '}
          {party.flags.length === 1 ? 'отмеченный эпизод' : 'отмеченных эпизода'}
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="audit-line">
        <span><Term name="audit">Проверены досье</Term></span>
        <span>места 1–{party.audit_depth}</span>
      </div>
    </article>
  );
}

/** Разворот одного списка: все позиции сразу, без переключения критериев. */
function PartySheet({ party, onClose }: { party: Party | null; onClose: () => void }) {
  return (
    <Sheet open={party !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent className="candidate-sheet data-[side=right]:sm:max-w-[560px]">
        {party && (
          <>
            <SheetHeader className="sheet-header">
              <p className="hebrew" lang="he" dir="rtl">{party.name_he}</p>
              <SheetTitle className="sheet-name">{party.name_ru}</SheetTitle>
              <SheetDescription>
                {party.leaders.join(' · ')} · места 1–{party.audit_depth} проверены
              </SheetDescription>
            </SheetHeader>
            <div className="sheet-body">
              <section>
                <p className="micro-label">Что это за список</p>
                <p className="sheet-bio">{party.descriptor}</p>
              </section>
              <section>
                <p className="micro-label">Позиции по всем критериям</p>
                <NoteList
                  items={party.positions.map(position => ({
                    ...position,
                    label: `${topicById(position.topic)?.label} · ${valueLabel(position)}`,
                  }))}
                />
              </section>
              <section>
                <p className="micro-label"><Term name="trust">Риск доверия</Term></p>
                <p>{party.trust_risk.text}</p>
                <div className="claim-footer">
                  <EvidenceTag claim={party.trust_risk} />
                  <SourceLinks ids={party.trust_risk.source_ids} compact />
                </div>
                <div className="flags-stack">
                  {party.flags.map((flag, i) => <FlagBlock key={i} flag={flag} />)}
                </div>
              </section>
              <section className="neutral-note">
                Позиция фиксируется по актуальной программе или прямому публичному заявлению.
                Там, где общей позиции списка найти не удалось, стоит «{KIND_LABEL.uncertainty}» —
                это результат поиска, а не пропуск.
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ *
 * Матрица
 * ------------------------------------------------------------------ */

function MatrixCell({ position, compact }: { position: Position; compact: boolean }) {
  if (!compact) {
    return (
      <TableCell>
        <p>{position.text}</p>
        <div className="claim-footer">
          <EvidenceTag claim={position} />
          <SourceLinks ids={position.source_ids} compact />
        </div>
      </TableCell>
    );
  }
  const unsettled = isUnsettled(position);
  return (
    <TableCell className="matrix-compact-cell">
      <Tooltip>
        <TooltipTrigger
          render={(
            <button
              type="button"
              className="value-chip"
              aria-label={`${topicById(position.topic)?.label}: ${valueLabel(position)}. Открыть полный текст`}
            />
          )}
        >
          <span className={`value-dot ${unsettled ? 'value-dot-unsettled' : ''}`} />
          <span>{valueLabel(position)}</span>
        </TooltipTrigger>
        <TooltipContent className="glossary-tip matrix-tip">
          <span>
            {position.text}
            <br />
            <b>{unsettled ? KIND_LABEL.uncertainty : KIND_LABEL[position.kind]}</b>
            {' · '}
            {VERIFICATION_LABEL[position.verification]}
          </span>
        </TooltipContent>
      </Tooltip>
      <SourceLinks ids={position.source_ids} compact />
    </TableCell>
  );
}

/**
 * Одна тема как шкала: полюса подписаны с обоих концов, партии стоят точками.
 *
 * Площади здесь нет намеренно. Радар сложил бы шесть осей в фигуру, чью
 * площадь читатель принял бы за суммарную оценку, а партия с пробелами
 * получила бы фигуру поменьше — и незаполненность данных выглядела бы
 * политической характеристикой. Строка такой суммы не образует.
 */
function ScaleRow({ topic, visible }: { topic: Topic & { axis: Axis }; visible: Party[] }) {
  const byStep = new Map<number, { party: Party; position: Position }[]>();
  const missing: { party: Party; position: Position }[] = [];

  for (const party of visible) {
    const position = party.positions.find(p => p.topic === topic.id)!;
    const at = axisPosition(topic, position);
    if (at === null) { missing.push({ party, position }); continue; }
    const group = byStep.get(at) ?? [];
    group.push({ party, position });
    byStep.set(at, group);
  }

  /* Совпадающие позиции разводим в кластер вокруг засечки. Иначе четыре
     партии с одинаковым ответом рисуются одной точкой, и главное, что
     показывает шкала — что они совпали, — становится невидимым. */
  const DOT_GAP = 17;
  const placed = [...byStep.entries()].flatMap(([at, group]) =>
    group.map((entry, i) => ({
      ...entry,
      at,
      offset: (i - (group.length - 1) / 2) * DOT_GAP,
      shared: group.length,
    })));

  return (
    <section className="scale-row">
      <p className="scale-topic">{topic.label}</p>
      <div className="scale-line">
        <span className="scale-pole">{topic.axis.low}</span>
        <span className="scale-track">
          {topic.axis.order.map((_, i) => (
            <span
              key={i}
              className="scale-step"
              style={{ left: `${(i / (topic.axis.order.length - 1)) * 100}%` }}
            />
          ))}
          {placed.map(({ party, position, at, offset, shared }) => (
            <Tooltip key={party.id}>
              <TooltipTrigger
                render={(
                  <button
                    type="button"
                    className="scale-dot"
                    style={{
                      left: `calc(${at * 100}% + ${offset}px)`,
                      background: party.color,
                    }}
                    aria-label={
                      shared > 1
                        ? `${party.name_ru}: ${valueLabel(position)} — так же, как ещё у ${shared - 1}`
                        : `${party.name_ru}: ${valueLabel(position)}`
                    }
                  />
                )}
              />
              <TooltipContent className="glossary-tip matrix-tip">
                <span>
                  <b>{party.name_ru} · {valueLabel(position)}</b>
                  <br />{position.text}
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </span>
        <span className="scale-pole scale-pole-high">{topic.axis.high}</span>
      </div>
      {missing.length > 0 && (
        <p className="scale-missing">
          <span>{KIND_LABEL.uncertainty}:</span>
          {missing.map(({ party }) => (
            <span key={party.id} className="scale-missing-item">
              <span className="matrix-party-dot" style={{ background: party.color }} />
              {party.name_ru}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Кандидаты
 * ------------------------------------------------------------------ */

function CandidateRow({
  candidate, outside, onOpen,
}: { candidate: Candidate; outside: boolean; onOpen: () => void }) {
  const mark = candidateMark(candidate);
  return (
    <div className={outside ? 'outside' : 'inside'}>
      <button className="candidate-row" type="button" onClick={onOpen}>
        <span className="candidate-number">{candidate.position}</span>
        <span className="candidate-main">
          <span className="candidate-name-line">
            <b>{candidate.name}</b>
            <em className={`depth depth-${candidate.profile_depth}`}>
              {DEPTH_LABEL[candidate.profile_depth]}
            </em>
          </span>
          <small>{candidate.summary}</small>
        </span>
        {mark && <span className={`dot dot-${mark}`} aria-label={COLOR_LABEL[mark]} />}
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

/**
 * Сценарий мандатов. Слайдер один: граница проверенных досье показана
 * засечкой под дорожкой и сменой цвета заливки, а не второй полосой.
 */
function ScenarioBox({
  party, seats, onChange,
}: { party: Party; seats: number; onChange: (value: number) => void }) {
  const beyond = seats > party.audit_depth;
  /* Доля заливки, которая приходится на проверенную часть списка. */
  const auditedShare = beyond ? `${(party.audit_depth / seats) * 100}%` : '100%';
  const auditedOnScale = `${(party.audit_depth / MAX_SEATS) * 100}%`;
  return (
    <div className={`scenario-box ${beyond ? 'scenario-beyond' : ''}`}>
      <div className="scenario-head">
        <span><Term name="scenario">Сценарий мандатов</Term></span>
        <b>{seats}</b>
      </div>
      <div
        className="scenario-scale"
        style={{ '--audited-share': auditedShare, '--audited-mark': auditedOnScale } as React.CSSProperties}
      >
        <Slider
          min={0}
          max={MAX_SEATS}
          step={1}
          value={[seats]}
          onValueChange={value => onChange(Array.isArray(value) ? value[0] : (value as number))}
          aria-label={`Число мандатов, от 0 до ${MAX_SEATS}`}
        />
        <span className="scale-boundary" aria-hidden="true">досье до {party.audit_depth}</span>
      </div>
      <p>
        {beyond
          ? `Досье проверены до места ${party.audit_depth}. Дальше биографического аудита ещё нет — места после ${party.audit_depth} показаны без него.`
          : meta.poll.note}
      </p>
    </div>
  );
}

/**
 * Выбор списка. На широком экране — колонка слева, на телефоне — обычный
 * выпадающий список: горизонтальная лента там скрывала половину вариантов.
 */
function PartyPicker({
  active, muted, onPick,
}: { active: Party; muted: boolean; onPick: (id: string) => void }) {
  return (
    <aside className="party-picker">
      <p className="micro-label">Список</p>
      <label className="party-select">
        <span className="sr-only">Выберите список</span>
        <select value={active.id} onChange={event => onPick(event.target.value)}>
          {parties.map(party => (
            <option key={party.id} value={party.id}>
              {party.name_ru} · {party.name_he}
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </label>
      <div className="party-list">
        {parties.map(party => (
          <button
            key={party.id}
            type="button"
            className={party.id === active.id && !muted ? 'active' : ''}
            onClick={() => onPick(party.id)}
          >
            <span className="matrix-party-dot" style={{ background: party.color }} />
            <span>
              <b lang="he" dir="rtl">{party.name_he}</b>
              <small>{party.name_ru}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </aside>
  );
}

function CandidateSheet({
  entry, seats, onClose,
}: {
  entry: { party: Party; candidate: Candidate } | null;
  seats: number;
  onClose: () => void;
}) {
  const candidate = entry?.candidate;
  const party = entry?.party;
  const status = candidate && candidate.position <= seats
    ? `проходит при ${seats} мандатах`
    : `не проходит при ${seats} мандатах`;
  return (
    <Sheet open={entry !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent className="candidate-sheet data-[side=right]:sm:max-w-[560px]">
        {candidate && party && (
          <>
            <SheetHeader className="sheet-header">
              <div className="candidate-number large">{candidate.position}</div>
              <p className="hebrew" lang="he" dir="rtl">{party.name_he}</p>
              <SheetTitle className="sheet-name">{candidate.name}</SheetTitle>
              <SheetDescription>{party.name_ru}</SheetDescription>
              <div className="sheet-badges">
                <span className="sheet-badge">{status}</span>
                <span className={`depth depth-${candidate.profile_depth}`}>
                  {DEPTH_LABEL[candidate.profile_depth]}
                </span>
              </div>
            </SheetHeader>
            <div className="sheet-body">
              <section>
                <p className="micro-label">Кто это</p>
                <p className="sheet-bio">{candidate.summary}</p>
                <div className="claim-footer">
                  <EvidenceTag claim={{ ...candidate, kind: 'fact' }} />
                  <SourceLinks ids={candidate.source_ids} />
                </div>
              </section>
              {candidate.strengths.length > 0 && (
                <section>
                  <p className="micro-label">Подтверждающие поступки</p>
                  <div className="profile-claims">
                    {candidate.strengths.map((item, i) => <ClaimBlock item={item} tone="positive" key={i} />)}
                  </div>
                </section>
              )}
              {candidate.concerns.length > 0 && (
                <section>
                  <p className="micro-label">Спорные эпизоды и риски</p>
                  <div className="profile-claims">
                    {candidate.concerns.map((item, i) => <ClaimBlock item={item} tone="caution" key={i} />)}
                  </div>
                </section>
              )}
              {candidate.criteria.length > 0 && (
                <section>
                  <p className="micro-label">По ключевым критериям</p>
                  <NoteList items={candidate.criteria} />
                </section>
              )}
              {candidate.trust_notes.length > 0 && (
                <section>
                  <p className="micro-label">Доверие и прозрачность</p>
                  <NoteList items={candidate.trust_notes} />
                </section>
              )}
              <section className="unknown-panel">
                <p className="micro-label">Чего пока не знаем</p>
                <ul>{candidate.unknowns.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </section>
              <section className="neutral-note">
                Это досье не выставляет кандидату итоговый балл. Сильный поступок, проблемный
                эпизод и пробел в данных показаны отдельно, чтобы вы сами определили их вес.
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ *
 * Источники
 * ------------------------------------------------------------------ */

function SourcesSection() {
  const grouped = useMemo(() => {
    const byType = new Map<string, typeof sources>();
    for (const source of sources) {
      const list = byType.get(source.type) ?? [];
      list.push(source);
      byType.set(source.type, list);
    }
    return SOURCE_TYPE_ORDER
      .filter(type => byType.has(type))
      .map(type => [type, byType.get(type)!] as const);
  }, []);

  return (
    <section className="sources-section">
      <p className="eyebrow">Источники</p>
      <h2>Проверяйте первоисточник</h2>
      <div className="sources-list">
        {grouped.map(([type, list]) => (
          <section key={type} className="source-group">
            <h3 className="micro-label">{SOURCE_TYPE_LABEL[type] ?? type} · {list.length}</h3>
            <ul>
              {list.map(source => (
                <li key={source.id}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}<ArrowUpRight size={13} />
                  </a>
                  <small>{sourceDateLine(source)}</small>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Страница
 * ------------------------------------------------------------------ */

export default function Home() {
  const url = useUrlState();

  const tab = url.get('tab', 'cards');
  const topic = topicById(url.get('topic', topics[0].id)) ? url.get('topic', topics[0].id) : topics[0].id;
  const hidden = new Set(url.get('hide', '').split(',').filter(Boolean));
  const visible = parties.filter(party => !hidden.has(party.id));

  const openCandidate = url.get('c', '');
  const selectedEntry = allCandidates.find(({ candidate }) => candidate.id === openCandidate) ?? null;
  /* Ссылка на человека может не нести партию: тогда берём её из самого досье. */
  const activeParty = partyById(url.get('party', selectedEntry?.party.id ?? parties[0].id)) ?? parties[0];
  const seats = url.getInt('seats', activeParty.default_seats, 0, MAX_SEATS);
  const query = url.get('q', '');
  const openParty = url.get('p', '');
  const matrixParam = url.get('matrix', 'compact');
  const matrixView: 'compact' | 'full' | 'scales' =
    matrixParam === 'full' || matrixParam === 'scales' ? matrixParam : 'compact';

  /** Поиск идёт по всем спискам сразу: человека ищут по имени, а не по партии. */
  const searching = query.trim().length > 0;
  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!searching) return [];
    return allCandidates.filter(({ candidate }) =>
      candidate.name.toLowerCase().includes(needle)
      || candidate.summary.toLowerCase().includes(needle)
      || candidate.bio.toLowerCase().includes(needle));
  }, [searching, needle]);

  const listed = searching
    ? results
    : (candidatesByParty[activeParty.id] ?? []).map(candidate => ({ party: activeParty, candidate }));

  const toggleParty = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id); else next.add(id);
    url.set({ hide: next.size ? [...next].join(',') : null });
  };

  return (
    <TooltipProvider delay={120}>
      <main>
        <header className="site-header">
          <div className="brand">
            <div className="mark"><span /><span /><span /></div>
            <div><strong>Выборы 2026</strong><span>партии и люди</span></div>
          </div>
          <div className="freshness">
            <span className="live-dot" />Проверено {formatDate(meta.as_of)}
          </div>
          <nav>
            <a href="/parties.json" target="_blank" aria-label="Открыть JSON партий и источников">
              <Database size={15} /><span>JSON данных</span>
            </a>
            <a href="/candidates.json" target="_blank" aria-label="Открыть JSON кандидатов">
              <Users size={15} /><span>JSON кандидатов</span>
            </a>
          </nav>
        </header>

        <section className="intro">
          <div>
            <p className="eyebrow">Нейтральный инструмент сравнения</p>
            <h1>Смотрите на позиции,<br /><em>проверяйте людей.</em></h1>
          </div>
          <p className="intro-copy">
            Шесть списков, поданных на выборы в Кнессет 26. Совета, за кого голосовать, здесь нет:
            тезис отделён от оценки, а тег показывает, чем он подтверждён.
          </p>
        </section>

        <div className="status-strip">
          <div>
            <ShieldCheck size={19} />
            <span>
              <b>Статус списков</b>
              поданы {formatDate(meta.lists.submitted_from)} — {formatDate(meta.lists.submitted_to)};
              официальное утверждение ещё впереди
            </span>
          </div>
          <div>
            <BookOpen size={19} />
            <span><b>{distinctSourceCount} источника</b>у каждого сохранена дата проверки</span>
          </div>
          <div>
            <Filter size={19} />
            <span>
              <b>Сколько человек проходит</b>
              зависит от числа мандатов — задайте его на вкладке «Кандидаты»
            </span>
          </div>
        </div>

        <Tabs value={tab} onValueChange={value => url.set({ tab: value })} className="workspace">
          <TabsList className="main-tabs" variant="line">
            <TabsTrigger value="cards">Карточки</TabsTrigger>
            <TabsTrigger value="matrix">Матрица</TabsTrigger>
            <TabsTrigger value="people">Кандидаты</TabsTrigger>
            <TabsTrigger value="method">Методика</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            <section className="control-panel">
              <div>
                <p className="micro-label">Критерий на карточках</p>
                <div className="topic-pills">
                  {topics.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={topic === item.id ? 'active' : ''}
                      onClick={() => url.set({ topic: item.id })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <div className="selection-bar">
              <span>
                Галочка «в сравнении» управляет и карточками, и матрицей.
                Сейчас выбрано <b>{visible.length} из {parties.length}</b>.
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => url.set({ hide: hidden.size ? null : parties.map(p => p.id).join(',') })}
              >
                {hidden.size ? 'Выбрать все' : 'Снять все'}
              </button>
            </div>
            {visible.length ? (
              <section className="party-grid">
                {parties.map((party, index) => (
                  <PartyCard
                    key={party.id}
                    party={party}
                    index={index}
                    checked={!hidden.has(party.id)}
                    toggle={() => toggleParty(party.id)}
                    topic={topic}
                    onOpen={() => url.set({ p: party.id })}
                  />
                ))}
              </section>
            ) : (
              <div className="empty-state">
                Все списки сняты. Отметьте хотя бы один, чтобы вернуть сравнение.
              </div>
            )}
          </TabsContent>

          <TabsContent value="matrix">
            <section className="matrix-head">
              <div>
                <p className="eyebrow">Сравнительная матрица</p>
                <h2>Одинаковые вопросы, разные ответы</h2>
              </div>
              <p>
                «{KIND_LABEL.uncertainty}» означает, что мы не нашли достаточно ясной общей позиции
                списка. Это тоже полезный результат.
              </p>
            </section>
            <div className="matrix-controls">
              <span>
                Показаны <b>{visible.length} из {parties.length}</b> списков — набор задан галочками
                «в сравнении» на вкладке «Карточки».
              </span>
              <div className="segmented">
                <button
                  type="button"
                  className={matrixView === 'compact' ? 'active' : ''}
                  onClick={() => url.set({ matrix: null })}
                >
                  Кратко
                </button>
                <button
                  type="button"
                  className={matrixView === 'full' ? 'active' : ''}
                  onClick={() => url.set({ matrix: 'full' })}
                >
                  Полный текст
                </button>
                <button
                  type="button"
                  className={matrixView === 'scales' ? 'active' : ''}
                  onClick={() => url.set({ matrix: 'scales' })}
                >
                  Шкалы
                </button>
              </div>
            </div>
            {!visible.length ? (
              <div className="empty-state">
                Все списки сняты галочкой «в сравнении» на вкладке «Карточки».
              </div>
            ) : matrixView === 'scales' ? (
              <>
                <div className="scales-legend">
                  {visible.map(party => (
                    <span key={party.id}>
                      <span className="matrix-party-dot" style={{ background: party.color }} />
                      {party.name_ru}
                    </span>
                  ))}
                </div>
                <div className="scales">
                  {scaledTopics.map(topic => (
                    <ScaleRow key={topic.id} topic={topic} visible={visible} />
                  ))}
                </div>
              </>
            ) : (
              <div className={`matrix-wrap ${matrixView === 'compact' ? 'matrix-compact' : ''}`}>
                <Table className="matrix-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky-col">Критерий</TableHead>
                      {visible.map(party => (
                        <TableHead key={party.id}>
                          <span className="matrix-party-dot" style={{ background: party.color }} />
                          {party.name_ru}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topics.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="sticky-col topic-cell">{item.label}</TableCell>
                        {visible.map(party => (
                          <MatrixCell
                            key={party.id}
                            position={party.positions.find(p => p.topic === item.id)!}
                            compact={matrixView === 'compact'}
                          />
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {matrixView === 'compact' && (
              <p className="matrix-hint">
                В кратком режиме в ячейке стоит короткая формулировка позиции. Наведите или
                нажмите на неё, чтобы прочитать полный текст и статус проверки.
              </p>
            )}
            {matrixView === 'scales' && (
              <p className="matrix-hint">
                Шкала показывает <b>порядок</b> позиций между двумя названными полюсами — и только
                порядок. Расстояние между ступенями ничего не измеряет, складывать шкалы между
                собой нельзя, суммарной оценки списка здесь нет. {topics.length - scaledTopics.length}{' '}
                критерия шкалы не получили: по ним позиции либо не выстраиваются на одной прямой,
                либо совпадают у всех, либо почти не установлены.
              </p>
            )}
          </TabsContent>

          <TabsContent value="people">
            <section className="people-layout">
              <PartyPicker
                active={activeParty}
                muted={searching}
                onPick={id => url.set({ party: id, seats: null, q: null })}
              />
              <section className="people-main">
                <div className="people-header">
                  <div>
                    {searching ? (
                      <>
                        <p className="hebrew">Поиск по всем спискам</p>
                        <h2>{results.length ? `Найдено: ${results.length}` : 'Ничего не найдено'}</h2>
                        <p className="people-deck">
                          Ищем по имени, краткому описанию и биографии во всех {parties.length} списках.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="hebrew" lang="he" dir="rtl">{activeParty.name_he}</p>
                        <h2>Кто проходит в Кнессет при {seats} мандатах</h2>
                        <p className="people-deck">
                          Нажмите на имя: опыт, подтверждающие поступки, спорные эпизоды,
                          связь с критериями и то, чего мы не нашли.
                        </p>
                      </>
                    )}
                  </div>
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      value={query}
                      onChange={event => url.set({ q: event.target.value || null })}
                      placeholder="Найти по всем спискам"
                      aria-label="Найти кандидата по всем спискам"
                    />
                    {searching && (
                      <button type="button" onClick={() => url.set({ q: null })} aria-label="Очистить поиск">
                        <X size={14} />
                      </button>
                    )}
                  </label>
                </div>

                {!searching && <ScenarioBox party={activeParty} seats={seats} onChange={next => url.set({ seats: next })} />}

                {listed.length ? (
                  <div className="candidate-list">
                    {listed.map(({ party, candidate }) => (
                      <CandidateRow
                        key={candidate.id}
                        candidate={candidate}
                        outside={!searching && candidate.position > seats}
                        onOpen={() => url.set({ c: candidate.id, party: party.id })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    По запросу «{query}» никого не нашли. Попробуйте фамилию или ключевое слово из
                    биографии — например, «ЦАХАЛ» или «мэр».
                  </div>
                )}

                {!searching && seats > activeParty.audit_depth && (
                  <p className="coverage-note">
                    Для мест после {activeParty.audit_depth} биографический аудит ещё не завершён.
                    Полный поданный порядок доступен в{' '}
                    <SourceLinks ids={meta.lists.source_ids.slice(0, 1)} />.
                  </p>
                )}
              </section>
            </section>
          </TabsContent>

          <TabsContent value="method">
            <section className="method-grid">
              <div className="method-copy">
                <p className="eyebrow">Как читать</p>
                <h2>Факт, позиция, оценка и пробел — четыре разные вещи</h2>
                <p>
                  <b>Факт</b> — проверяемое событие: должность, голосование, публичное действие.
                  <b> Позиция или обещание</b> — то, что список заявляет о будущем; проверить можно
                  формулировку, но не исполнение. <b>Оценка редакции</b> — наша интерпретация того,
                  как факт влияет на доверие или согласованность. <b>{KIND_LABEL.uncertainty}</b> —
                  результат поиска, при котором ясной позиции или источника не нашлось.
                </p>
                <p>
                  Почему именно эти шесть списков: пять из них образуют сравнимое поле оппозиции
                  Нетаньяху с разными ответами на одни и те же вопросы, а шестой взят как{' '}
                  <Term name="control">контрольный вариант</Term> — чтобы отличия внутри первой
                  группы были видны на фоне, а не сами по себе.
                </p>
              </div>
              <div className="legend-card">
                <div>
                  <span className="evidence-tag evidence-fact"><CheckCircle2 size={13} />{KIND_LABEL.fact}</span>
                  <p>Проверяемое событие. Есть хотя бы один доступный источник.</p>
                </div>
                <div>
                  <span className="evidence-tag evidence-fact"><CheckCircle2 size={13} />{KIND_LABEL.position}</span>
                  <p>Заявление о будущем из программы или прямой речи. Тот же тег, но обещание — не факт.</p>
                </div>
                <div>
                  <span className="evidence-tag evidence-assessment"><AlertCircle size={13} />{KIND_LABEL.assessment}</span>
                  <p>Интерпретация редакции. Без источника такая запись понижается до пробела.</p>
                </div>
                <div>
                  <span className="evidence-tag evidence-uncertain"><CircleHelp size={13} />{KIND_LABEL.uncertainty}</span>
                  <p>Позиция не найдена, источник отсутствует или переносить взгляд одного лидера на союз нельзя.</p>
                </div>
                <div>
                  <p className="micro-label">Уровень проверки</p>
                  <p>
                    У каждого тега есть подсказка: {VERIFICATION_LABEL.verified},
                    {' '}{VERIFICATION_LABEL.partial} или {VERIFICATION_LABEL.unverified}, плюс{' '}
                    {CONFIDENCE_LABEL.confirmed} либо {CONFIDENCE_LABEL.limited}. Шкала уверенности
                    двухступенчатая: третьей ступени в этом корпусе честно нет.
                  </p>
                </div>
              </div>
              <div className="method-card">
                <b>Цвет эпизода</b>
                <p>{GLOSSARY.colors}</p>
                <div className="legend-dots">
                  <span><span className="dot dot-green" />{COLOR_LABEL.green}</span>
                  <span><span className="dot dot-yellow" />{COLOR_LABEL.yellow}</span>
                  <span><span className="dot dot-red" />{COLOR_LABEL.red}</span>
                </div>
              </div>
              <div className="method-card">
                <b>Глубина досье</b>
                <p>{GLOSSARY.depth}</p>
                <div className="legend-dots">
                  <span className="depth depth-substantive">{DEPTH_LABEL.substantive}</span>
                  <span className="depth depth-basic">{DEPTH_LABEL.basic}</span>
                  <span className="depth depth-limited">{DEPTH_LABEL.limited}</span>
                </div>
              </div>
              <div className="method-card">
                <b>Что не делает сайт</b>
                <p>Не рассчитывает «совпадение», не ранжирует списки и не выдаёт персональную рекомендацию.</p>
              </div>
              <div className="method-card">
                <b>Шкалы и почему это не баллы</b>
                <p>
                  На вкладке «Матрица» есть режим «Шкалы»: {scaledTopics.length} критериев, у каждого
                  названы оба полюса. Шкала утверждает только <b>порядок</b> позиций между полюсами —
                  расстояние между ступенями ничего не измеряет, и складывать шкалы между собой нельзя.
                  Поэтому здесь нет ни радара, ни суммарной фигуры: её площадь читалась бы как оценка
                  списка, а список с пробелами в данных выглядел бы «слабее» просто потому, что про
                  него меньше найдено. Пробелы показаны отдельной строкой, а не точкой в нуле.
                  Оставшиеся {topics.length - scaledTopics.length} критерия шкалы не получили: позиции
                  по ним либо не выстраиваются на одной прямой, либо совпадают у всех, либо почти не
                  установлены. Направление осей — редакционное решение, оно записано в{' '}
                  <code>topics[].axis</code> в наборе данных и открыто для спора.
                </p>
              </div>
              <div className="method-card">
                <b>Нашли ошибку</b>
                <p>
                  Напишите, что именно неверно и на какой источник опереться. Правка с ссылкой
                  рассматривается всегда, правка без ссылки — нет: утверждение, которое нельзя
                  проверить, нельзя и опубликовать.
                </p>
                <a
                  href="https://github.com/Ari-Shatunovsky/israel-parties-2026-compare/issues/new/choose"
                  target="_blank"
                  rel="noreferrer"
                >
                  Сообщить об ошибке <ArrowUpRight size={14} />
                </a>
              </div>
            </section>
            <SourcesSection />
          </TabsContent>
        </Tabs>

        <footer>
          <span>Обновлено {formatDate(meta.as_of)}</span>
          <span>Нейтральный исследовательский проект · без агитации</span>
        </footer>

        <PartySheet party={partyById(openParty) ?? null} onClose={() => url.set({ p: null })} />
        <CandidateSheet entry={selectedEntry} seats={seats} onClose={() => url.set({ c: null })} />
      </main>
    </TooltipProvider>
  );
}
