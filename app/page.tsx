'use client';

import { useMemo, useState } from 'react';
import partiesData from '../public/parties.json';
import candidatesData from '../public/candidates.json';
import {
  AlertCircle, ArrowUpRight, BookOpen, CheckCircle2, ChevronRight,
  CircleHelp, Database, Filter, Search, ShieldCheck, Users
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger
} from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';

type Claim = { text:string; kind:string; source_ids:string[]; verification:string; confidence:string };
type Flag = Claim & { color:string; title:string };
type Candidate = { position:number; name:string; bio:string; source_ids:string[]; verification:string; confidence:string; flags:Flag[] };
type Position = Claim & { topic:string; value:string };
type Party = {
  id:string; name_he:string; name_ru:string; leaders:string[]; descriptor:string; control:boolean;
  color:string; default_seats:number; audit_depth:number; positions:Position[]; trust_risk:Claim; flags:Flag[];
};
type Source = { id:string; title:string; url:string; published_at:string|null; accessed_at:string; type:string; date_note?:string|null };

const data = partiesData as unknown as { as_of:string; topics:{id:string;label:string}[]; sources:Source[]; parties:Party[] };
const candidateMap = (candidatesData as unknown as { parties:Record<string,Candidate[]> }).parties;
const sourceMap = Object.fromEntries(data.sources.map(s => [s.id, s]));

const kindLabel:Record<string,string> = {
  position:'Позиция / обещание', fact:'Факт', assessment:'Оценка редакции', uncertainty:'Неуверенность'
};
const flagStyle:Record<string,string> = {
  red:'border-red-200 bg-red-50 text-red-900',
  yellow:'border-amber-200 bg-amber-50 text-amber-950',
  green:'border-emerald-200 bg-emerald-50 text-emerald-950'
};

function SourceLinks({ ids, compact=false }:{ ids:string[]; compact?:boolean }) {
  if (!ids?.length) return <span className="uncertain">Источник не подтверждён</span>;
  return <span className={compact ? 'source-row compact' : 'source-row'}>
    {ids.map(id => sourceMap[id]).filter(Boolean).map(source => (
      <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
        {compact ? '↗' : source.title}<span className="sr-only"> (откроется в новой вкладке)</span>
      </a>
    ))}
  </span>;
}

function EvidenceTag({ claim }:{ claim:Claim }) {
  const isUncertain = claim.verification !== 'verified' || claim.kind === 'uncertainty';
  return <span className={'evidence-tag ' + (isUncertain ? 'evidence-uncertain' : claim.kind === 'assessment' ? 'evidence-assessment' : 'evidence-fact')}>
    {isUncertain ? <CircleHelp size={13}/> : claim.kind === 'assessment' ? <AlertCircle size={13}/> : <CheckCircle2 size={13}/>}
    {isUncertain ? 'Неуверенность' : kindLabel[claim.kind] || 'Факт'}
  </span>;
}

function FlagBlock({ flag }:{ flag:Flag }) {
  return <div className={'flag-block ' + (flagStyle[flag.color] || flagStyle.yellow)}>
    <div className="flag-head"><strong>{flag.title}</strong><EvidenceTag claim={flag}/></div>
    <p>{flag.text}</p>
    <SourceLinks ids={flag.source_ids} compact/>
  </div>;
}

function PartyCard({ party, checked, toggle, topic }:{ party:Party; checked:boolean; toggle:()=>void; topic:string }) {
  const position = party.positions.find(p => p.topic === topic)!;
  return <article className={'party-card ' + (!checked ? 'party-card-muted' : '')}>
    <div className="card-rule" style={{background:party.color}}/>
    <div className="party-card-top">
      <label className="party-check">
        <Checkbox checked={checked} onCheckedChange={toggle} aria-label={'Показывать ' + party.name_ru}/>
        <span>в сравнении</span>
      </label>
      {party.control && <span className="control-badge">контрольный вариант</span>}
    </div>
    <div className="party-title-row">
      <div>
        <div className="hebrew" lang="he" dir="rtl">{party.name_he}</div>
        <h2>{party.name_ru}</h2>
      </div>
      <div className="seats"><b>{party.default_seats || '—'}</b><span>мест<br/>в опросе N12</span></div>
    </div>
    <p className="descriptor">{party.descriptor}</p>
    <p className="leaders">{party.leaders.join(' · ')}</p>
    <div className="card-position">
      <span className="micro-label">{data.topics.find(t => t.id === topic)?.label}</span>
      <p>{position.text}</p>
      <div className="claim-footer"><EvidenceTag claim={position}/><SourceLinks ids={position.source_ids} compact/></div>
    </div>
    <details className="trust-details">
      <summary>Риск доверия · {party.flags.length} эпиз.</summary>
      <p>{party.trust_risk.text}</p>
      <div className="claim-footer"><EvidenceTag claim={party.trust_risk}/><SourceLinks ids={party.trust_risk.source_ids} compact/></div>
      {party.flags.map((f,i)=><FlagBlock key={i} flag={f}/>) }
    </details>
    <div className="audit-line">
      <span>Проверяемая зона</span>
      <span>места 1–{party.audit_depth}</span>
    </div>
  </article>;
}

function CandidateSheet({ candidate, party, activeSeats }:{ candidate:Candidate; party:Party; activeSeats:number }) {
  const status = candidate.position <= activeSeats ? 'входит в сценарий' : 'за пределами сценария';
  return <Sheet>
    <SheetTrigger render={
      <button className="candidate-row" type="button">
        <span className="candidate-number">{candidate.position}</span>
        <span className="candidate-main"><b>{candidate.name}</b><small>{candidate.bio}</small></span>
        {candidate.flags?.length > 0 && <span className={'dot dot-' + candidate.flags[0].color} aria-label="есть отмеченный эпизод"/>}
        <ChevronRight size={17}/>
      </button>
    }/>
    <SheetContent className="candidate-sheet sm:max-w-lg">
      <SheetHeader className="sheet-header">
        <div className="candidate-number large">{candidate.position}</div>
        <p className="hebrew" lang="he" dir="rtl">{party.name_he}</p>
        <SheetTitle className="sheet-name">{candidate.name}</SheetTitle>
        <SheetDescription>{party.name_ru} · {status}</SheetDescription>
      </SheetHeader>
      <div className="sheet-body">
        <section>
          <p className="micro-label">Биография</p>
          <p className="sheet-bio">{candidate.bio}</p>
          <div className="claim-footer"><EvidenceTag claim={candidate as unknown as Claim}/><SourceLinks ids={candidate.source_ids}/></div>
        </section>
        {candidate.flags?.length > 0 && <section>
          <p className="micro-label">Эпизоды для проверки</p>
          <div className="flags-stack">{candidate.flags.map((f,i)=><FlagBlock flag={f} key={i}/>)}</div>
        </section>}
        <section className="neutral-note">
          Цвет относится к конкретному эпизоду, а не к человеку целиком. Формулировка краткая: откройте источники перед выводом.
        </section>
      </div>
    </SheetContent>
  </Sheet>;
}

export default function Home() {
  const [topic, setTopic] = useState('netanyahu');
  const [selected, setSelected] = useState<string[]>(data.parties.map(p=>p.id));
  const [candidateParty, setCandidateParty] = useState('yashar');
  const [seats, setSeats] = useState<Record<string,number>>(Object.fromEntries(data.parties.map(p=>[p.id,p.default_seats])));
  const [query, setQuery] = useState('');

  const visible = data.parties.filter(p=>selected.includes(p.id));
  const activeParty = data.parties.find(p=>p.id===candidateParty)!;
  const candidates = (candidateMap[candidateParty] || []).filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  const activeSeats = seats[candidateParty];
  const sourceCount = useMemo(() => new Set(data.sources.map(s=>s.url)).size, []);

  return <main>
    <header className="site-header">
      <div className="brand">
        <div className="mark"><span/><span/><span/></div>
        <div><strong>Выборы 2026</strong><span>партии и люди</span></div>
      </div>
      <div className="freshness"><span className="live-dot"/>Проверено {data.as_of.split('-').reverse().join('.')}</div>
      <nav>
        <a href="/parties.json" target="_blank"><Database size={15}/> JSON данных</a>
        <a href="/candidates.json" target="_blank"><Users size={15}/> JSON кандидатов</a>
      </nav>
    </header>

    <section className="intro">
      <div>
        <p className="eyebrow">Нейтральный инструмент сравнения</p>
        <h1>Смотрите на позиции,<br/><em>проверяйте людей.</em></h1>
      </div>
      <p className="intro-copy">Шесть списков, поданных на выборы в Кнессет 26. Здесь нет совета, за кого голосовать: каждый тезис отделён от редакционной оценки и снабжён уровнем уверенности.</p>
    </section>

    <div className="status-strip">
      <div><ShieldCheck size={19}/><span><b>Статус списков</b> поданы 8–9 сентября; официальное утверждение ещё впереди</span></div>
      <div><BookOpen size={19}/><span><b>{sourceCount} источника</b> дата проверки сохранена в JSON</span></div>
      <div><Filter size={19}/><span><b>Проходная зона</b> меняется вместе со сценарием мандатов</span></div>
    </div>

    <Tabs defaultValue="cards" className="workspace">
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
              {data.topics.map(t=><button key={t.id} className={topic===t.id?'active':''} onClick={()=>setTopic(t.id)}>{t.label}</button>)}
            </div>
          </div>
          <div>
            <p className="micro-label">Показывать</p>
            <button className="text-button" onClick={()=>setSelected(selected.length===data.parties.length?[]:data.parties.map(p=>p.id))}>
              {selected.length===data.parties.length?'Снять все':'Выбрать все'}
            </button>
          </div>
        </section>
        {visible.length ? <section className="party-grid">
          {data.parties.map(p=><PartyCard key={p.id} party={p} checked={selected.includes(p.id)} toggle={()=>setSelected(s=>s.includes(p.id)?s.filter(x=>x!==p.id):[...s,p.id])} topic={topic}/>)}
        </section> : <div className="empty-state">Выберите хотя бы одну партию для сравнения.</div>}
      </TabsContent>

      <TabsContent value="matrix">
        <section className="matrix-head">
          <div><p className="eyebrow">Сравнительная матрица</p><h2>Одинаковые вопросы, разные ответы</h2></div>
          <p>«Не установлено» означает, что мы не нашли достаточно ясной общей позиции списка. Это тоже полезный результат.</p>
        </section>
        <div className="matrix-wrap">
          <Table className="matrix-table">
            <TableHeader><TableRow><TableHead className="sticky-col">Критерий</TableHead>{visible.map(p=><TableHead key={p.id}><span className="matrix-party-dot" style={{background:p.color}}/>{p.name_ru}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{data.topics.map(t=><TableRow key={t.id}><TableCell className="sticky-col topic-cell">{t.label}</TableCell>{visible.map(p=>{const x=p.positions.find(y=>y.topic===t.id)!;return <TableCell key={p.id}><p>{x.text}</p><div className="claim-footer"><EvidenceTag claim={x}/><SourceLinks ids={x.source_ids} compact/></div></TableCell>})}</TableRow>)}</TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="people">
        <section className="people-layout">
          <aside className="party-selector">
            <p className="micro-label">Список</p>
            {data.parties.map(p=><button key={p.id} className={p.id===candidateParty?'active':''} onClick={()=>{setCandidateParty(p.id);setQuery('')}}>
              <span className="matrix-party-dot" style={{background:p.color}}/><span><b lang="he" dir="rtl">{p.name_he}</b><small>{p.name_ru}</small></span><ChevronRight size={16}/>
            </button>)}
          </aside>
          <section className="people-main">
            <div className="people-header">
              <div><p className="hebrew" lang="he" dir="rtl">{activeParty.name_he}</p><h2>Кто входит при {activeSeats} мандатах</h2></div>
              <label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти кандидата" aria-label="Найти кандидата"/></label>
            </div>
            <div className="scenario-box">
              <div><span>Сценарий мандатов</span><b>{activeSeats}</b></div>
              <Slider min={0} max={activeParty.audit_depth} step={1} value={[activeSeats]} onValueChange={v=>setSeats(s=>({...s,[candidateParty]:Array.isArray(v)?v[0]:v as number}))} aria-label="Число мандатов"/>
              <p>Это сценарий для чтения списка, а не прогноз. Значение по умолчанию — последний найденный опрос N12.</p>
            </div>
            <div className="candidate-list">
              {candidates.map(c=><div key={c.position} className={c.position<=activeSeats?'inside':'outside'}><CandidateSheet candidate={c} party={activeParty} activeSeats={activeSeats}/></div>)}
            </div>
            {activeSeats > candidates.length && <p className="coverage-note">Для мест после {candidates.length} биографический аудит ещё не завершён; полный поданный порядок доступен в источнике списков.</p>}
          </section>
        </section>
      </TabsContent>

      <TabsContent value="method">
        <section className="method-grid">
          <div className="method-copy">
            <p className="eyebrow">Как читать</p>
            <h2>Факт, оценка и пробел — три разные вещи</h2>
            <p>Позиция партии фиксируется по актуальной программе или прямому заявлению. Биографический факт подтверждает опыт человека, но не предсказывает его голосование. Цветной флаг — редакционная пометка конкретного эпизода, которую можно перепроверить по ссылке.</p>
          </div>
          <div className="legend-card">
            <div><span className="evidence-tag evidence-fact"><CheckCircle2 size={13}/>Факт / позиция</span><p>Есть хотя бы один доступный источник. Для спорных тезисов предпочтительны два.</p></div>
            <div><span className="evidence-tag evidence-assessment"><AlertCircle size={13}/>Оценка редакции</span><p>Интерпретация влияния факта на доверие или согласованность.</p></div>
            <div><span className="evidence-tag evidence-uncertain"><CircleHelp size={13}/>Неуверенность</span><p>Общая позиция не найдена, источник отсутствует или переносить позицию одного лидера на союз нельзя.</p></div>
          </div>
          <div className="method-card"><b>Что не делает сайт</b><p>Не рассчитывает «совпадение», не ранжирует партии и не выдаёт персональную рекомендацию.</p></div>
          <div className="method-card"><b>Что ещё меняется</b><p>Списки должны пройти официальное утверждение. Опросы — снимки мнений, а не вероятность результата.</p></div>
          <div className="method-card"><b>Как исправить ошибку</b><p>Откройте исходный JSON: каждый тезис связан с идентификаторами источников и датой проверки.</p><a href="/parties.json" target="_blank">Открыть набор данных <ArrowUpRight size={14}/></a></div>
        </section>
        <section className="sources-section">
          <p className="eyebrow">Источники</p><h2>Проверяйте первоисточник</h2>
          <div className="sources-grid">{data.sources.map(s=><a key={s.id} href={s.url} target="_blank" rel="noreferrer"><span>{s.type}</span><b>{s.title}</b><small>{s.published_at || 'дата публикации не установлена'} · проверено {s.accessed_at}</small><ArrowUpRight size={16}/></a>)}</div>
        </section>
      </TabsContent>
    </Tabs>

    <footer><span>Обновлено {data.as_of}</span><span>Нейтральный исследовательский проект · без агитации</span></footer>
  </main>;
}
