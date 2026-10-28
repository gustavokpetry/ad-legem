/* Ad Legem — app.js
   Estrutura: dados (data.json) → busca → painel do artigo → fichas → navegação/voltar → tema → backup. */
(function(){
'use strict';
const $ = s=>document.querySelector(s);
const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm = s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

/* ---------- persistência ---------- */
const store = {
  get(k,d){ try{ const v=localStorage.getItem('leiseca:'+k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem('leiseca:'+k, JSON.stringify(v)); }catch(e){ toast('Não foi possível salvar neste aparelho.'); } }
};
let saved = new Set(store.get('saved',[]));
// Pede ao navegador para não apagar os dados quando faltar espaço (sem perguntar nada na abertura).
function askPersist(){
  if(askPersist.done || !navigator.storage || !navigator.storage.persist) return;
  askPersist.done=true;
  navigator.storage.persisted().then(p=>p||navigator.storage.persist()).catch(()=>{});
}
function toast(t){ const el=$('#toast'); el.textContent=t; el.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>{el.hidden=true;},2200); }

/* ---------- dados ---------- */
let META=null, CODES=[], ARTS=[], CODE={}, BYCODE={}, BYID={}, SIGLA={};
function loadData(d){
  if(!d || !Array.isArray(d.codes) || !Array.isArray(d.arts) || !d.arts.length) throw new Error('dados inválidos');
  META=d; CODES=d.codes; ARTS=d.arts;
  CODE=Object.fromEntries(CODES.map(c=>[c.id,c]));
  BYCODE={}; BYID={};
  ARTS.forEach(a=>{ (BYCODE[a.c] ||= []).push(a); a.p=BYCODE[a.c].length-1; BYID[a.id]=a; });
  SIGLA=Object.fromEntries(CODES.map(c=>[c.sigla.toLowerCase(),c.id]));
}
const dataDate = ()=>{ const m=(META&&META.gerado_em||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${m[3]}/${m[2]}/${m[1]}`:''; };

/* ---------- formatting ---------- */
function inline(s){
  s = esc(s);
  s = s.replace(/\*\((.+?)\)\*/g,'<span class="nota">($1)</span>');
  s = s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+?)\*/g,'<em>$1</em>');
  s = s.replace(/\*+/g,'');
  return s;
}
function fmt(t){
  return t.split(/\n{2,}/).map(b=>{
    const raw=b.trim(); if(!raw) return '';
    const plain=raw.replace(/^\*\*/,'');
    let cls='';
    if(/^[IVXLC]+\s*[-–—]/.test(plain)) cls='inc';
    else if(/^[a-z]\)/.test(plain)) cls='al';
    else if(/^(§|Parágrafo único)/i.test(plain)) cls='par';
    return `<p${cls?` class="${cls}"`:''}>${inline(raw).replace(/\n/g,'<br>')}</p>`;
  }).join('');
}
function lastHead(h){ const p=h.split(' › '); return (p[p.length-1]||'').replace(/^(TÍTULO|CAPÍTULO|SEÇÃO|Seção|Subseção|LIVRO|PARTE)\s+[IVXLC]+(\s*[-—–]\s*)?/i,'').trim() || p[p.length-1] || ''; }

/* ---------- filtro por código (um por vez) ---------- */
let active = new Set();
const allCodes = ()=>new Set(CODES.map(c=>c.id));
const filtered = ()=>active.size===1;
function renderTabs(){
  const all=!filtered();
  const tb=(id,label,on,title)=>`<button class="tab" data-c="${id}" aria-pressed="${on}" title="${esc(title)}"><span class="${on?'hl':''}">${label}</span></button>`;
  $('#tabs').innerHTML = tb('*','Todos',all,'Todos os códigos') + CODES.map(c=>tb(c.id,c.sigla,!all&&active.has(c.id),c.nome)).join('');
}
function setFilter(c){
  active = (c==='*' || (filtered() && active.has(c))) ? allCodes() : new Set([c]);
  renderTabs(); page=1; runSearch();
}
$('#tabs').addEventListener('click',e=>{ const b=e.target.closest('.tab'); if(b && ARTS.length) setFilter(b.dataset.c); });

/* ---------- busca ---------- */
let indexed=false;
const plain=t=>t.replace(/\*\([^)]*\)\*/g,'').replace(/[*#]/g,'').replace(/\s+/g,' ').trim();
function buildIndex(){ if(indexed) return; for(const a of ARTS){ a._p=plain(a.t); a._x=norm(a._p); a._h=norm(a.h); } indexed=true; }
const STOP=new Set('a o e de da do das dos em no na nos nas um uma uns umas para por com que se ao aos as os ou art arts artigo artigos lei qual quais como quando onde sobre ser sao e eh'.split(' '));
function stem(t){ if(t.length>5){ t=t.replace(/(coes|cao|soes|sao|mente|idades|idade|ais|ados|adas|ado|ada|ivel|veis|os|as|es|s)$/,''); } return t; }
function parseRef(q){
  const n=norm(q).trim();
  let m=n.match(/^(?:art(?:igo)?s?\.?\s*)?(\d{1,4}(?:\.\d{3})?)\s*(?:o|º|°)?\s*(?:-\s*([a-z]))?\s*(?:,|do|da|de)?\s*([a-z]{2,5})?$/);
  let m2=n.match(/^([a-z]{2,5})\s*,?\s*(?:art(?:igo)?\.?\s*)?(\d{1,4}(?:\.\d{3})?)\s*(?:o|º|°)?\s*(?:-\s*([a-z]))?$/);
  let num,suf,code;
  if(m2 && SIGLA[m2[1]]){ code=SIGLA[m2[1]]; num=m2[2]; suf=m2[3]; }
  else if(m && /^art/.test(n) || (m && m[3] && SIGLA[m[3]])){ num=m[1]; suf=m[2]; code=m[3]&&SIGLA[m[3]]; if(m[3] && !SIGLA[m[3]]) return null; }
  else return null;
  const k=parseInt(num.replace('.',''),10);
  const want=suf?('-'+suf.toUpperCase()):'';
  return ARTS.filter(a=>a.k===k && (code? a.c===code : active.has(a.c)) && (want? a.n.endsWith(want) : !/-[A-Z]$/.test(a.n)));
}
function search(q){
  buildIndex();
  const hide=$('#hiderev').checked;
  const raw=norm(q).split(/[^a-z0-9]+/).filter(t=>t.length>1 && !STOP.has(t));
  const toks=[...new Set(raw.map(stem))];
  if(!toks.length) return [];
  const phrase=raw.length>1?raw.join(' '):null;
  const out=[];
  for(const a of ARTS){
    if(!active.has(a.c) || (hide && a.r)) continue;
    let s=0, ok=true;
    for(const t of toks){
      const i=a._x.indexOf(t), inH=a._h.indexOf(t)>=0;
      if(i<0 && !inH){ ok=false; break; }
      s += (i>=0?3:0) + (i>=0 && i<220?3:0) + (inH?3:0);
      if(i>=0){ let c=0,j=i; while(c<4 && (j=a._x.indexOf(t,j+1))>=0) c++; s+=c*.5; }
    }
    if(ok){ for(const w of raw) if(a._x.indexOf(w)>=0) s+=1.5;
      if(phrase){ const pi=a._x.indexOf(phrase); if(pi>=0) s+= pi<220?9:6; }
      s -= Math.min(4, a.t.length/5000); if(a.c==='cf'||a.c==='lindb') s+=.5; out.push([s,a]); }
  }
  out.sort((x,y)=>y[0]-x[0]);
  return out.map(x=>x[1]);
}
function snippet(a,toks){
  buildIndex(); const x=a._x; let pos=-1;
  for(const t of toks){ const i=x.indexOf(t); if(i>=0 && (pos<0||i<pos)) pos=i; }
  let st = pos>140 ? x.lastIndexOf(' ',pos-80) : 0; if(st<0) st=0;
  let s=a._p.slice(st, st+420);
  s=esc(s);
  if(toks.length){
    const re=new RegExp(toks.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gi');
    const n=norm(s); let res='', last=0, m;
    while((m=re.exec(n))){ res+=s.slice(last,m.index)+'<mark>'+s.slice(m.index,m.index+m[0].length)+'</mark>'; last=m.index+m[0].length; if(!m[0].length) re.lastIndex++; }
    s=res+s.slice(last);
  }
  return (st>0?'… ':'')+s;
}
function artCard(a,toks){
  const label=`${CODE[a.c].sigla}, artigo ${a.n}${a.r?', revogado':''}${saved.has(a.id)?', grifado':''}. ${(a._p||'').slice(0,90)}`;
  return `<button class="art${a.r?' rev':''}" data-id="${esc(a.id)}" aria-label="${esc(label)}">
    <span class="mg" aria-hidden="true"><span class="sg">${CODE[a.c].sigla}</span><span class="an">${esc(a.n)}</span></span>
    <span aria-hidden="true">${a.h?`<span class="where">${esc(lastHead(a.h))}</span>`:''}
    <span class="snip">${snippet(a,toks||[])}</span>${a.r||saved.has(a.id)?`<span class="tag">${a.r?'revogado':''}${a.r&&saved.has(a.id)?' · ':''}${saved.has(a.id)?'grifado':''}</span>`:''}</span></button>`;
}
let page=1, lastList=[], lastToks=[], lastHead_='';
function renderList(list,toks,head){
  lastList=list; lastToks=toks; lastHead_=head;
  const n=page*40;
  $('#results').innerHTML = (head?`<p class="count" role="status">${head}</p>`:'') + list.slice(0,n).map(a=>artCard(a,toks)).join('') +
    (list.length>n?`<button class="more" id="more">Mostrar mais (${list.length-n})</button>`:'');
}
function intro(){
  const one = filtered() ? [...active][0] : null;
  if(one){ const list=BYCODE[one].filter(a=>!($('#hiderev').checked&&a.r)); renderList(list,[],`${esc(CODE[one].nome)} · ${list.length} artigos, em ordem`); return; }
  $('#results').innerHTML = `<div class="toc"><h2>INDEX</h2>${CODES.map(c=>`<button data-open="${c.id}"><span class="sg">${c.sigla}</span><span class="nm">${esc(c.nome)}</span><span class="dots"></span><span class="ct">${BYCODE[c.id].length} arts.</span></button>`).join('')}
    <p class="stamp">Texto das leis de ${dataDate()}, compilado de fontes oficiais pelo projeto <a href="${esc(META.origem||'https://github.com/ctresb/leis')}" target="_blank" rel="noopener">ctresb/leis</a>. Confira sempre a fonte oficial antes de citar.</p></div>`;
}
let tmr;
function runSearch(){
  if(!ARTS.length) return;
  const q=$('#q').value.trim();
  $('#hero').hidden = !!q || filtered();
  syncResultsLayer();
  if(!q){ intro(); return; }
  buildIndex();
  const ref=parseRef(q);
  const toks=[...new Set(norm(q).split(/[^a-z0-9]+/).filter(t=>t.length>1 && !STOP.has(t)).map(stem))];
  let list=search(q);
  if(ref && ref.length){ const ids=new Set(ref.map(a=>a.id)); list=ref.concat(list.filter(a=>!ids.has(a.id))); }
  renderList(list, ref&&ref.length?[]:toks, list.length? `${list.length} resultado${list.length>1?'s':''}` : 'Nada encontrado. Tente outra palavra ou toque em “Todos” para buscar em todos os códigos.');
}
$('#q').addEventListener('input',()=>{ clearTimeout(tmr); page=1; tmr=setTimeout(runSearch,180); });
$('#q').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); clearTimeout(tmr); runSearch(); $('#q').blur(); } });
$('#hiderev').addEventListener('change',()=>{page=1;runSearch();});
$('#shownotes').addEventListener('change',e=>document.body.classList.toggle('nonotes',!e.target.checked));
$('#results').addEventListener('click',e=>{
  if(e.target.closest('#retry')){ boot(); return; }
  const op=e.target.closest('[data-open]'); if(op){ $('#q').value=''; setFilter(op.dataset.open); window.scrollTo(0,0); return; }
  if(e.target.closest('#more')){ page++; renderList(lastList,lastToks,lastHead_); return; }
  const b=e.target.closest('.art'); if(b) openArt(BYID[b.dataset.id]);
});

/* ---------- painel do artigo ---------- */
let cur=null, lastFocus=null;
const BACKDROP=['header.top','main','.bnav'];
function openArt(a){
  if(!a) return; cur=a;
  if($('#sheet').hidden){ lastFocus=document.activeElement; pushLayer('sheet'); }
  $('#sh-where').textContent = (a.h || CODE[a.c].nome).toLowerCase();
  $('#sh-title').innerHTML = `<span class="sg">${CODE[a.c].sigla}</span>Art. ${esc(a.n)}`;
  $('#sh-body').innerHTML = fmt(a.t) + `<p class="nota" style="margin-top:1.2em">${esc(CODE[a.c].nome)}. Texto de ${dataDate()}, para estudo; confira na fonte oficial antes de citar.</p>`;
  $('#sh-body').scrollTop=0;
  $('#sh-src').href = CODE[a.c].fonte;
  setSave();
  const L=BYCODE[a.c]; $('#sh-prev').disabled=a.p===0; $('#sh-next').disabled=a.p===L.length-1;
  if($('#sheet').hidden){
    $('#sheet').hidden=false; document.body.style.overflow='hidden';
    BACKDROP.forEach(s=>{ const el=$(s); if(el) el.inert=true; });
    $('#sh-close').focus();
  }
}
function hideSheet(){
  if($('#sheet').hidden) return;
  $('#sheet').hidden=true; document.body.style.overflow='';
  BACKDROP.forEach(s=>{ const el=$(s); if(el) el.inert=false; });
  if(lastFocus && lastFocus.isConnected) lastFocus.focus();
  if(!$('#v-buscar').hidden && lastList.length){ const y=window.scrollY; renderList(lastList,lastToks,lastHead_); window.scrollTo(0,y); }
}
function closeArt(){ hideSheet(); dropLayer('sheet'); }
function setSave(){ const on=!!(cur&&saved.has(cur.id)); const b=$('#sh-save'); b.classList.toggle('on',on); b.querySelector('span').textContent=on?'Grifado':'Grifar'; b.setAttribute('aria-pressed',on); }
$('#sh-close').onclick=closeArt;
$('#sheet').addEventListener('click',e=>{ if(e.target.id==='sheet') closeArt(); });
document.addEventListener('keydown',e=>{
  if($('#sheet').hidden) return;
  if(e.key==='Escape') closeArt();
  if(e.key==='ArrowLeft') $('#sh-prev').click();
  if(e.key==='ArrowRight') $('#sh-next').click();
});
$('#sh-prev').onclick=()=>{ if(cur&&cur.p>0) openArt(BYCODE[cur.c][cur.p-1]); };
$('#sh-next').onclick=()=>{ if(cur&&cur.p<BYCODE[cur.c].length-1) openArt(BYCODE[cur.c][cur.p+1]); };
$('#sh-save').onclick=()=>{
  if(!cur) return;
  if(saved.has(cur.id)){ saved.delete(cur.id); toast('Grifo removido.'); } else { saved.add(cur.id); toast('Grifado. Ele entra nas suas fichas.'); askPersist(); }
  store.set('saved',[...saved]); setSave();
};

/* ---------- tamanho do texto ---------- */
const FS=['normal','grande','maior'];
function applyFs(){
  const i=Math.max(0,Math.min(2,store.get('fs',0)));
  document.documentElement.dataset.fs=i;
  $('#sh-fs').setAttribute('aria-label',`Tamanho do texto: ${FS[i]}. Tocar para mudar`);
}
$('#sh-fs').onclick=()=>{ store.set('fs',(store.get('fs',0)+1)%3); applyFs(); toast(`Texto ${FS[store.get('fs',0)]}`); };

/* ---------- estudo: trilhas → lições (ler + perguntas) → revisão ---------- */
const TRILHAS=[
  {id:'lindb',   nome:'LINDB',                              sub:'Lei de Introdução, inteira', c:'lindb', de:1, ate:30},
  {id:'cf-fund', nome:'Princípios e direitos fundamentais', sub:'CF, arts. 1º a 17',          c:'cf',    de:1, ate:17},
  {id:'cc-geral',nome:'Código Civil · Parte Geral',         sub:'CC, arts. 1º a 232',         c:'cc',    de:1, ate:232},
  {id:'cp-geral',nome:'Código Penal · Parte Geral',         sub:'CP, arts. 1º a 120',         c:'cp',    de:1, ate:120},
];
const fullTrack=c=>({id:'all-'+c, nome:CODE[c].nome, sub:`${CODE[c].sigla}, completo`, c, de:0, ate:1e9});
const trackById=id=>TRILHAS.find(t=>t.id===id) || (id&&id.startsWith('all-')&&CODE[id.slice(4)] ? fullTrack(id.slice(4)) : null);
const plainTxt=t=>t.replace(/\*\([^)]*\)\*/g,'').replace(/\*+/g,'').replace(/[ \t]+/g,' ').trim();
// bloco revogado: depois de tirar o rótulo (I -, § 2º, a)...), sobra só o aviso de revogação ou nada
const LABEL_RE=/^(?:[IVXLC]+\s*[-–—]\s*|§\s*\d+º?\.?\s*|Parágrafo único\.?\s*|[a-z]\)\s*)/i;
const isRevokedBlock=raw=>{ const b=raw.replace(/\*+/g,'').trim().replace(LABEL_RE,'').trim(); return !b || /^\(?\s*(revogad|vetad)/i.test(b) || !plainTxt(raw).replace(LABEL_RE,'').trim(); };

// Um artigo vira um ou mais "itens de leitura"; artigos muito longos (ex.: art. 5º da CF) são divididos.
function readingItems(a){
  const raw=a.t.split(/\n{2,}/).filter(b=>b.trim());
  const keep=raw.filter((b,i)=>i===0 || !isRevokedBlock(b));
  if(!keep.length) return [];
  const mk=(parts,k,sub)=>({key:a.id+(k?'#p'+k:''), a, raw:parts, blocks:parts.map(plainTxt), sub, part:0,
    len:parts.reduce((s,p)=>s+p.length,0)});
  const total=keep.reduce((s,p)=>s+p.length,0);
  if(total<=1500) return [mk(keep,0,'')];
  const items=[]; let cur=[keep[0]], size=keep[0].length;
  const rom=b=>{ const m=plainTxt(b).match(/^([IVXLC]+)\s*[-–—]/); return m?m[1]:null; };
  const label=parts=>{ const r=parts.map(rom).filter(Boolean); return r.length? (r.length>1?`incisos ${r[0]} a ${r[r.length-1]}`:`inciso ${r[0]}`) : ''; };
  for(const b of keep.slice(1)){
    if(size+b.length>1200 && cur.length){ items.push(cur); cur=[]; size=0; }
    cur.push(b); size+=b.length;
  }
  if(cur.length) items.push(cur);
  return items.map((parts,k)=>{ const lb=label(parts); const r=parts.map(rom).filter(Boolean); const it=mk(parts,k, k?lb:(lb?'caput e '+lb:'caput')); it.part=k; it.r0=r[0]; it.r1=r[r.length-1]; if(k) it.caput=plainTxt(keep[0]); return it; });
}
const lessonCache=new Map();
function lessonsOf(t){
  if(lessonCache.has(t.id)) return lessonCache.get(t.id);
  const arts=BYCODE[t.c].filter(a=>a.k>=t.de && a.k<=t.ate && !a.r);
  const items=arts.flatMap(readingItems);
  const lessons=[]; let cur=null;
  const headOf=it=>it.a.h||'';
  for(const it of items){
    const newHead = cur && headOf(it)!==headOf(cur.items[cur.items.length-1]);
    if(!cur || cur.items.length>=5 || cur.len+it.len>3000 || (newHead && cur.items.length>=3)){
      cur={items:[],len:0}; lessons.push(cur);
    }
    cur.items.push(it); cur.len+=it.len;
  }
  lessons.forEach((l,i)=>{
    l.i=i;
    const f=l.items[0].a, z=l.items[l.items.length-1].a;
    l.title = lastHead(f.h) ? cap1(lastHead(f.h).toLowerCase()) : null;
    const fi=l.items[0], zi=l.items[l.items.length-1];
    if(f.id===z.id && fi.sub){
      const a=fi.r0, b=zi.r1||zi.r0, inc = a ? (b&&b!==a ? `incisos ${a} a ${b}` : `inciso ${a}`) : '';
      l.range = `art. ${f.n}, ${fi.part===0 ? (inc?'caput e '+inc:'caput') : (inc||zi.sub)}`;
    } else l.range = f.id===z.id ? `art. ${f.n}` : `arts. ${f.n} a ${z.n}`;
    if(!l.title) l.title=cap1(l.range);
    l.minutes = Math.max(2, Math.round(l.len/900 + 1.5));
  });
  lessonCache.set(t.id,lessons);
  return lessons;
}
const cap1=s=>s.charAt(0).toUpperCase()+s.slice(1);

function questionsFor(items, t, seed, max){
  const labelsOf=it=>BYCODE[it.a.c];
  const qs=[];
  items.forEach(it=>{
    const list=labelsOf(it), p=it.a.p;
    const neighbors=list.slice(Math.max(0,p-4),p+5).filter(x=>!x.r).map(x=>'Art. '+x.n);
    const genItem={id:it.key, c:it.a.c, n:it.a.n, label:'Art. '+it.a.n+(it.sub?', '+it.sub:''), blocks:it.blocks};
    qs.push(...Perguntas.gerar(genItem,{max: items.length<=3?2:1, neighbors, seed, famous: it.part===0}));
  });
  // embaralha de forma estável e limita
  const h=s=>{ let x=2166136261; for(const ch of s){ x^=ch.charCodeAt(0); x=Math.imul(x,16777619);} return x>>>0; };
  return qs.sort((a,b)=>h(seed+a.id)-h(seed+b.id)).slice(0,max);
}

/* progresso salvo */
let trilhas=store.get('trilhas',{});          // { trilhaId: [índices de lições concluídas] }
let rev=store.get('rev',{});                  // { idPergunta: { q, b, due } }
let curTrack=store.get('cur',null);
const IV=[1,3,7,16,35,80];                    // dias até a próxima revisão
const day=864e5;
const doneSet=id=>new Set(trilhas[id]||[]);
function dueReviews(){ const now=Date.now(); return Object.values(rev).filter(r=>r&&r.q&&r.due<=now).sort((a,b)=>a.due-b.due); }
function nextLesson(t){ const ls=lessonsOf(t), d=doneSet(t.id); return ls.find(l=>!d.has(l.i)) || null; }
const plural=(n,a,b)=>`${n} ${n===1?a:b}`;

function trackRow(t){
  const ls=lessonsOf(t), d=doneSet(t.id), n=ls.filter(l=>d.has(l.i)).length;
  const pct=ls.length?Math.round(n/ls.length*100):0;
  const act = n===0?'Começar':n===ls.length?'Concluída':'Continuar';
  return `<button class="deck" data-track="${t.id}" aria-label="${esc(`${t.nome}. ${n} de ${ls.length} lições. ${act}`)}"><span class="dbody" aria-hidden="true">
    <span class="dn">${esc(t.nome)}</span><span class="dm">${esc(t.sub)}</span>
    <span class="bar"><i style="width:${pct}%"></i></span><span class="dm">${n} de ${plural(ls.length,'lição','lições')}</span></span>
    <span class="act${act==='Concluída'?' fin':''}" aria-hidden="true">${act}</span></button>`;
}
function renderStudy(){
  if(!ARTS.length) return;
  const t=trackById(curTrack)||TRILHAS[0];
  const nl=nextLesson(t);
  const due=dueReviews();
  let html='';
  if(nl){
    const first=!curTrack;
    html+=`<div class="tl">${first?'Comece por aqui':'Continuar'}</div>
      <div class="tn">${esc(t.nome)}</div>
      <p class="lsn">Lição ${nl.i+1} de ${lessonsOf(t).length} · ${esc(nl.title)}</p>
      <p class="meta">${esc(nl.range)} · cerca de ${nl.minutes} min</p>
      <button class="go big" data-start="${t.id}|${nl.i}">${first?'Começar a primeira lição':'Começar lição'}</button>`;
  } else {
    html+=`<div class="tl">Trilha concluída</div><div class="tn">${esc(t.nome)}</div><p class="meta">Escolha outra trilha abaixo para continuar.</p>`;
  }
  if(due.length){
    html+=`<div class="revbox"><div><b>Revisão do dia</b><span>${plural(Math.min(due.length,10),'pergunta','perguntas')} do que você já estudou</span></div><button class="go ghost" id="go-rev">Revisar</button></div>`;
  }
  $('#today').innerHTML=html;
  $('#tracks').innerHTML=TRILHAS.map(trackRow).join('');
  if($('#tracks-all').closest('details').open) $('#tracks-all').innerHTML=CODES.map(c=>trackRow(fullTrack(c.id))).join('');
  $('#grifos').innerHTML = saved.size
    ? `<button class="deck" id="go-grifos"><span class="dbody"><span class="dn">Praticar meus grifos</span><span class="dm">${plural(saved.size,'artigo grifado','artigos grifados')}</span></span><span class="act">Praticar</span></button>`
    : `<p class="how">Ao ler um artigo na busca, toque em Grifar. Depois você pode praticar só os artigos grifados aqui.</p>`;
}
$('#tracks-all').closest('details').addEventListener('toggle',e=>{ if(e.target.open && !$('#tracks-all').innerHTML) renderStudy(); });

/* tela da trilha (lista de lições) */
let trackOpen=null;
function openTrack(id){
  const t=trackById(id); if(!t) return;
  trackOpen=t; pushLayer('track'); renderTrack(true);
}
function renderTrack(scroll){
  const t=trackOpen; const ls=lessonsOf(t), d=doneSet(t.id), nx=nextLesson(t);
  $('#trackview').innerHTML=`<div class="studyhead"><button class="backbtn" id="tr-back" aria-label="Voltar às trilhas">${BACK_ICON}</button><span>${esc(t.sub)}</span></div>
    <h2>${esc(t.nome)}</h2>
    <p class="how">${plural(ls.length,'lição','lições')} · ${ls.filter(l=>d.has(l.i)).length} concluídas</p>
    <ol class="lessons">${ls.map(l=>`<li><button class="lesson${d.has(l.i)?' ok':''}${nx&&nx.i===l.i?' next':''}" data-start="${t.id}|${l.i}">
      <span class="ln" aria-hidden="true">${d.has(l.i)?'✓':l.i+1}</span>
      <span class="lt"><b>${esc(l.title)}</b><small>${esc(l.range)} · ${l.minutes} min${d.has(l.i)?' · concluída':''}${nx&&nx.i===l.i?' · próxima':''}</small></span></button></li>`).join('')}</ol>`;
  $('#studyhome').hidden=true; $('#trackview').hidden=false; window.scrollTo(0,0);
  const n=$('#trackview .lesson.next'); if(scroll && n && n.offsetTop>window.innerHeight*.6) n.scrollIntoView({block:'center'});
}
function hideTrack(){ if(!trackOpen) return; trackOpen=null; $('#trackview').hidden=true; if(!inSession){ $('#studyhome').hidden=false; renderStudy(); } }

/* sessão: lição (ler → perguntas → resultado), revisão ou grifos */
let S=null, inSession=false;
const BACK_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const X_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
function startLesson(tid, li, reuse){
  const t=trackById(tid); const l=t&&lessonsOf(t)[li]; if(!l) return;
  curTrack=t.id; store.set('cur',curTrack);
  S={kind:'lesson', t, l, title:`Lição ${l.i+1} · ${l.title}`, items:l.items, ri:0, phase:'read',
     qs:questionsFor(l.items,t,t.id+'#'+l.i,8), qi:0, answers:[]};
  if(reuse){ renderSession(); window.scrollTo(0,0); } else openSession();
}
function startReview(){
  const due=dueReviews().slice(0,10).map(r=>r.q);
  if(!due.length){ toast('Nada para revisar agora.'); return; }
  S={kind:'review', title:'Revisão do dia', items:[], ri:0, phase:'quiz', qs:due, qi:0, answers:[]}; openSession();
}
function startGrifos(){
  const items=[...saved].map(id=>BYID[id]).filter(Boolean).flatMap(readingItems);
  const qs=questionsFor(items,null,'grifos'+Date.now().toString().slice(0,-5),10);
  if(!qs.length){ toast('Os artigos grifados ainda não rendem perguntas. Grife mais alguns.'); return; }
  S={kind:'grifos', title:'Meus grifos', items:[], ri:0, phase:'quiz', qs, qi:0, answers:[]}; openSession();
}
function openSession(){
  inSession=true; pushLayer('session');
  $('#studyhome').hidden=true; $('#trackview').hidden=true; $('#studyrun').hidden=false; renderSession();
}
function hideSession(){
  if(!inSession) return; inSession=false; S=null;
  $('#studyrun').hidden=true;
  if(trackOpen) renderTrack(false); else { $('#studyhome').hidden=false; renderStudy(); }
  window.scrollTo(0,0);
}
function endSession(){ hideSession(); dropLayer('session'); }

function sessionHead(){
  const nr=S.items.length, nq=S.qs.length, tot=nr+nq;
  const pos = S.phase==='read' ? S.ri : S.phase==='quiz' ? nr+S.qi : tot;
  const segs=Array.from({length:tot},(_,i)=>`<i class="${i<pos?'on':''}${i<nr?' rd':''}"></i>`).join('');
  return `<div class="studyhead"><button class="xbtn" id="st-x" aria-label="Sair">${X_ICON}</button><span>${esc(S.title)}</span></div>
    <div class="segs" role="progressbar" aria-valuemin="0" aria-valuemax="${tot}" aria-valuenow="${pos}" aria-label="Progresso">${segs}</div>`;
}
function renderSession(){
  const el=$('#studyrun');
  if(S.phase==='read'){
    const it=S.items[S.ri], a=it.a, last=S.ri===S.items.length-1;
    el.innerHTML=sessionHead()+`<div class="step">Leitura ${S.ri+1} de ${S.items.length}</div>
      <article class="card read">
        <div class="ctop"><span class="sg">${CODE[a.c].sigla}</span>${a.h?`<span class="sep">·</span>${esc(lastHead(a.h).toLowerCase())}`:''}</div>
        <div class="cl">Art. ${esc(a.n)}${it.sub?`<small>${esc(it.sub)}</small>`:''}</div>
        ${it.caput?`<p class="ctx">${esc(clip(it.caput,200))}</p>`:''}
        <div class="q lex">${fmt(it.raw.join('\n\n'))}</div>
      </article>
      <div class="actions">${S.ri>0?`<button class="go ghost" id="rd-prev">Anterior</button>`:''}
        <button class="go" id="rd-next">${!last?'Próximo artigo':S.qs.length?`Ir para as perguntas (${S.qs.length})`:'Concluir lição'}</button></div>`;
    $('#rd-next').focus({preventScroll:true});
    return;
  }
  if(S.phase==='quiz'){
    const q=S.qs[S.qi], ans=S.answers[S.qi];
    el.innerHTML=sessionHead()+`<div class="step">Pergunta ${S.qi+1} de ${S.qs.length}</div>`+questionHTML(q,ans)+
      (ans?`<div class="actions"><button class="go" id="q-next">${S.qi<S.qs.length-1?'Continuar':'Ver resultado'}</button></div>`:'');
    (ans?$('#q-next'):el.querySelector('.opt')).focus({preventScroll:true});
    if(ans){ const fb=el.querySelector('.fb'); if(fb) requestAnimationFrame(()=>fb.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})); }
    return;
  }
  // resultado
  const ok=S.answers.filter(a=>a&&a.ok).length, n=S.qs.length;
  const misses=S.qs.map((q,i)=>({q,a:S.answers[i]})).filter(x=>x.a&&!x.a.ok);
  let nextBtn='';
  if(S.kind==='lesson'){ const nx=nextLesson(S.t); nextBtn = nx?`<button class="go" data-start="${S.t.id}|${nx.i}">Próxima lição</button>`:''; }
  el.innerHTML=sessionHead()+`<div class="done study">
    <h2>${n?(ok===n?'OPTIME':'FINIS'):'FINIS'}</h2>
    ${n?`<p class="score"><b>${ok}</b> de ${n} certas</p>`:`<p>Lição de leitura concluída.</p>`}
    <q>${ok===n?'Dura lex, sed lex.':'Errando se aprende.'}</q>
    ${misses.length?`<div class="misses"><h3>Para rever</h3>${misses.map(x=>`<p>${x.q.type==='artigo'?`<b>${esc(CODE[x.q.c].sigla)}</b>: `:`<b>${esc(CODE[x.q.c].sigla)}, ${esc(x.q.label)}</b>: `}${missLine(x.q)}</p>`).join('')}<p class="how">Essas perguntas voltam amanhã na revisão do dia.</p></div>`:''}
    <div class="actions">${nextBtn}<button class="go ghost" id="st-done">Voltar</button></div></div>`;
  ($('#studyrun [data-start]')||$('#st-done')).focus({preventScroll:true});
}
function clip(s,n){ if(s.length<=n) return s; const c=s.lastIndexOf(' ',n); return s.slice(0,c>40?c:n)+'…'; }
function missLine(q){
  if(q.type==='artigo') return `“${esc(clip(q.excerpt,70))}” é do ${esc(q.right)}.`;
  return `o texto diz «${esc(q.right)}»${q.type==='vf'&&!q.truth?`, não «${esc(q.shown)}»`:''}.`;
}
function sentence(q,mid){ return `${q.pre}${esc(q.before)}${mid}${esc(q.after)}${q.post}`; }
function questionHTML(q,ans){
  const ctx=q.ctx?`<p class="ctx">${esc(q.ctx)}</p>`:'';
  const head=`<div class="ctop"><span class="sg">${esc(CODE[q.c].nome)}</span>${q.type==='artigo'?'':`<span class="sep">·</span>${esc(q.label)}`}</div>`;
  let body='', opts=[];
  if(q.type==='vf'){
    body=`<div class="kind">Certo ou errado?</div>${ctx}<p class="qtext">${sentence(q, ans? `<mark class="${q.truth?'good':'bad'}">${esc(q.shown)}</mark>` : `<span class="hot">${esc(q.shown)}</span>`)}</p>`;
    opts=[['true','Certo'],['false','Errado']];
  } else if(q.type==='lacuna'){
    body=`<div class="kind">Complete</div>${ctx}<p class="qtext">${sentence(q, ans?`<mark class="good">${esc(q.right)}</mark>`:'<span class="blank" aria-label="lacuna">______</span>')}</p>`;
    opts=q.options.map(o=>[o,o]);
  } else {
    body=`<div class="kind">Qual é o artigo?</div><p class="qtext">“${esc(q.excerpt)}”</p>`;
    opts=q.options.map(o=>[o,o]);
  }
  const correctVal = q.type==='vf' ? String(q.truth) : q.right;
  const buttons=opts.map(([v,lbl],i)=>{
    let cls='opt';
    if(ans){ if(v===correctVal) cls+=' right'; else if(v===ans.v) cls+=' wrong'; else cls+=' dim'; }
    return `<button class="${cls}" data-v="${esc(v)}" ${ans?'disabled':''}><span class="k" aria-hidden="true">${i+1}</span>${esc(lbl)}</button>`;
  }).join('');
  let fb='';
  if(ans){
    const art=BYID[q.art.split('#')[0]];
    fb=`<div class="fb ${ans.ok?'ok':'no'}" role="status"><b>${ans.ok?'Correto.':'Não é isso.'}</b> ${
      q.type==='vf' ? (q.truth?'O trecho está exatamente como na lei.':`A lei diz «${esc(q.right)}», não «${esc(q.shown)}».`)
      : q.type==='lacuna' ? `A palavra da lei é «${esc(q.right)}».` : `É o ${esc(q.right)}.`}
      ${art?` <button class="linkbtn" data-art="${esc(art.id)}">Ler o artigo inteiro</button>`:''}</div>`;
  }
  return `<article class="card quiz">${head}${body}<div class="opts${q.type==='vf'?' two':''}">${buttons}</div>${fb}</article>`;
}
function answer(v){
  const q=S.qs[S.qi]; if(S.answers[S.qi]) return;
  const ok = q.type==='vf' ? String(q.truth)===v : v===q.right;
  S.answers[S.qi]={v,ok};
  const r=rev[q.id]||{q,b:-1,due:0}; r.q=q;
  if(ok){ r.b=Math.min(IV.length-1,r.b+1); r.due=Date.now()+IV[r.b]*day; }
  else { r.b=-1; r.due=Date.now()+day; }
  rev[q.id]=r; store.set('rev',rev); askPersist();
  renderSession();
}
function nextStep(){
  if(S.phase==='read'){
    if(S.ri<S.items.length-1){ S.ri++; }
    else if(S.qs.length){ S.phase='quiz'; S.qi=0; }
    else { finishLesson(); S.phase='result'; }
  } else if(S.phase==='quiz'){
    if(S.qi<S.qs.length-1) S.qi++; else { finishLesson(); S.phase='result'; }
  }
  renderSession(); window.scrollTo(0,0);
}
function finishLesson(){
  if(S.kind!=='lesson') return;
  const d=doneSet(S.t.id); d.add(S.l.i); trilhas[S.t.id]=[...d]; store.set('trilhas',trilhas);
}
$('#studyrun').addEventListener('click',e=>{
  e.stopPropagation();   // a tela é redesenhada; sem isso o clique "vaza" para o tratador da aba
  const t=e.target;
  if(t.closest('#st-x,#st-done')) return endSession();
  if(t.closest('#rd-next')) return nextStep();
  if(t.closest('#rd-prev')){ S.ri=Math.max(0,S.ri-1); renderSession(); window.scrollTo(0,0); return; }
  if(t.closest('#q-next')) return nextStep();
  const o=t.closest('.opt'); if(o && !o.disabled) return answer(o.dataset.v);
  const la=t.closest('[data-art]'); if(la) return openArt(BYID[la.dataset.art]);
  const st=t.closest('[data-start]'); if(st){ const [tid,li]=st.dataset.start.split('|'); startLesson(tid,+li,true); }
});
$('#v-estudar').addEventListener('click',e=>{
  const st=e.target.closest('[data-start]'); if(st){ const [tid,li]=st.dataset.start.split('|'); startLesson(tid,+li); return; }
  const tr=e.target.closest('[data-track]'); if(tr){ openTrack(tr.dataset.track); return; }
  if(e.target.closest('#tr-back')){ hideTrack(); dropLayer('track'); return; }
  if(e.target.closest('#go-rev')) return startReview();
  if(e.target.closest('#go-grifos')) return startGrifos();
});
document.addEventListener('keydown',e=>{
  if(!inSession || !$('#sheet').hidden || e.target.matches('input,textarea,select')) return;
  if(S.phase==='quiz' && !S.answers[S.qi] && /^[1-4]$/.test(e.key)){ const o=$$('#studyrun .opt')[+e.key-1]; if(o) answer(o.dataset.v); }
});
const $$=s=>[...document.querySelectorAll(s)];

/* ---------- backup do progresso ---------- */
$('#bk-save').onclick=async()=>{
  const body=JSON.stringify({app:'ad-legem',versao:2,salvo_em:new Date().toISOString(),saved:[...saved],trilhas,rev,cur:curTrack});
  const name=`ad-legem-progresso-${new Date().toISOString().slice(0,10)}.json`;
  const file=new File([body],name,{type:'application/json'});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:'Progresso do Ad Legem'}); return; }
  }catch(e){ if(e && e.name==='AbortError') return; }
  const url=URL.createObjectURL(file); const a=document.createElement('a'); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
  toast('Cópia salva nos downloads.');
};
$('#bk-load').onclick=()=>$('#bk-file').click();
$('#bk-file').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try{
    const d=JSON.parse(await f.text());
    if(d.app!=='ad-legem' || !Array.isArray(d.saved)) throw new Error();
    const nT=Object.values(d.trilhas||{}).reduce((s,x)=>s+(Array.isArray(x)?x.length:0),0);
    if(!confirm(`Restaurar a cópia de ${new Date(d.salvo_em).toLocaleDateString('pt-BR')}? Ela tem ${d.saved.length} grifos e ${nT} lições concluídas, e substitui o progresso atual deste aparelho.`)) return;
    saved=new Set(d.saved.filter(id=>typeof id==='string'));
    trilhas={}; for(const [k,v] of Object.entries(d.trilhas||{})) if(Array.isArray(v)) trilhas[k]=v.filter(Number.isInteger);
    rev={}; for(const [k,v] of Object.entries(d.rev||{})) if(v && v.q && typeof v.due==='number') rev[k]={q:v.q,b:+v.b||0,due:v.due};
    curTrack=typeof d.cur==='string'?d.cur:null;
    store.set('saved',[...saved]); store.set('trilhas',trilhas); store.set('rev',rev); store.set('cur',curTrack); askPersist();
    renderStudy(); toast('Progresso restaurado.');
  }catch(err){ toast('Este arquivo não é uma cópia válida do Ad Legem.'); }
};

/* ---------- navegação e botão voltar ----------
   Cada camada aberta (resultados, aba Estudar, sessão de fichas, artigo) vira uma entrada no histórico.
   O "voltar" do Android fecha a camada de cima em vez de sair do app. */
const layers=[]; let skipPops=0;
let pendingPush=[];
function pushLayer(name){
  layers.push(name);
  // se ainda há um history.go() em andamento, espera ele terminar para não embaralhar o histórico
  if(skipPops) pendingPush.push(layers.length); else history.pushState({adl:layers.length},'');
}
function dropLayer(name){ // fechamento pela interface: tira a entrada correspondente do histórico
  const i=layers.lastIndexOf(name); if(i<0) return;
  const n=layers.length-i; layers.length=i; skipPops++; history.go(-n);
}
window.addEventListener('popstate',()=>{
  if(skipPops){ skipPops--; if(!skipPops && pendingPush.length){ pendingPush.forEach(n=>history.pushState({adl:n},'')); pendingPush=[]; } return; }
  const name=layers.pop();
  if(name==='sheet') hideSheet();
  else if(name==='session') hideSession();
  else if(name==='track') hideTrack();
  else if(name==='estudar') showView('buscar');
  else if(name==='results'){ $('#q').value=''; active=allCodes(); renderTabs(); page=1; runSearch(); window.scrollTo(0,0); }
});
function syncResultsLayer(){
  const on = !!$('#q').value.trim() || filtered();
  if(on && !layers.includes('results')) pushLayer('results');
  else if(!on && layers[layers.length-1]==='results') dropLayer('results');
}
function showView(v){
  ['buscar','estudar'].forEach(x=>$('#v-'+x).hidden = x!==v);
  document.querySelectorAll('[data-go]').forEach(b=>{ if(b.classList.contains('mark')) return; const on=b.dataset.go===v; b.setAttribute('aria-current', on?'page':'false'); const s=b.querySelector('span'); if(s) s.className=on?'hl':''; });
  if(v==='estudar' && !$('#studyhome').hidden) renderStudy();
  window.scrollTo(0,0);
}
function go(v){
  if(v==='estudar'){
    if(inSession) return;                              // já está estudando
    if(trackOpen){ hideTrack(); dropLayer('track'); }  // tocar em Estudar volta para o início da aba
    if(!layers.includes('estudar')) pushLayer('estudar');
    showView('estudar');
  } else {
    if(inSession){ inSession=false; S=null; $('#studyrun').hidden=true; }
    if(trackOpen){ trackOpen=null; $('#trackview').hidden=true; }
    $('#studyhome').hidden=false;
    const i=layers.indexOf('estudar'); if(i>=0) dropLayer('estudar');
    showView('buscar');
  }
}
function goHome(){
  hideSheet(); inSession=false; S=null; trackOpen=null; $('#studyrun').hidden=true; $('#trackview').hidden=true; $('#studyhome').hidden=false;
  if(layers.length){ const n=layers.length; layers.length=0; skipPops++; history.go(-n); }
  $('#q').value=''; if(CODES.length){ active=allCodes(); renderTabs(); }
  showView('buscar'); page=1; runSearch();
}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',e=>{
  e.preventDefault();
  if(b.classList.contains('mark')) goHome(); else go(b.dataset.go);
}));

/* ---------- tema ---------- */
const mq=matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){
  const pref=store.get('theme',null);
  if(pref) document.documentElement.dataset.theme=pref; else delete document.documentElement.dataset.theme;
  const dark = pref ? pref==='dark' : mq.matches;
  document.documentElement.classList.toggle('isdark',dark);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{ m.content = dark?'#0F1A15':'#FCFBF8'; });
  $('#themebtn').setAttribute('aria-label', dark?'Mudar para o modo claro':'Mudar para o modo escuro');
}
$('#themebtn').onclick=()=>{ store.set('theme', document.documentElement.classList.contains('isdark')?'light':'dark'); applyTheme(); };
if(mq.addEventListener) mq.addEventListener('change',applyTheme);

/* ---------- início ---------- */
async function boot(){
  $('#results').innerHTML='<p class="loading" role="status">Carregando as leis…</p>';
  try{
    const r=await fetch('data.json');
    if(!r.ok) throw new Error('HTTP '+r.status);
    loadData(await r.json());
  }catch(err){
    $('#results').innerHTML=`<div class="error" role="alert"><p>Não foi possível carregar as leis. Confira a conexão e tente de novo.</p><button class="go" id="retry">Tentar de novo</button></div>`;
    return;
  }
  active=allCodes(); renderTabs(); runSearch();
  setTimeout(buildIndex,400);
}
applyTheme(); applyFs();
history.replaceState({adl:0},'',location.pathname+location.search);
showView('buscar');
boot();
if('serviceWorker' in navigator && window.isSecureContext){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
})();
