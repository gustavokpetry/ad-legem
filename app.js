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
let srs = store.get('srs',{});
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

/* ---------- fichas ---------- */
const PRESETS=[
  {id:'cf-fund',nome:'Princípios e direitos fundamentais',c:'cf',de:1,ate:17},
  {id:'lindb',nome:'LINDB inteira',c:'lindb',de:1,ate:30},
  {id:'cc-geral',nome:'Código Civil · Parte Geral',c:'cc',de:1,ate:232},
  {id:'cp-geral',nome:'Código Penal · Parte Geral',c:'cp',de:1,ate:120},
];
const ROM=/^([IVXLC]+)\s*[-–—]/;
function unitsOf(a){
  if(a.r) return [];
  const clean=t=>t.replace(/\*\([^)]*\)\*/g,'').trim();
  if(a.t.length<=700) return [{id:a.id, a, sub:'', text:a.t}];
  const blocks=a.t.split(/\n{2,}/); const units=[]; let u={sub:'caput',parts:[blocks[0]]};
  for(const raw of blocks.slice(1)){
    const b=raw.replace(/^\*\*/,'');
    let m;
    if((m=b.match(/^(§\s*\d+º?|Parágrafo único)/i))){ units.push(u); u={sub:m[1].replace(/\s+/,' ').toLowerCase().startsWith('par')?'parágrafo único':m[1].replace(/\s+/,' '),parts:[raw]}; }
    else if((m=b.match(ROM))){ units.push(u); u={sub:'inciso '+m[1],parts:[raw]}; }
    else u.parts.push(raw);
  }
  units.push(u);
  return units.map((x,i)=>({id:a.id+'#'+i, a, sub:x.sub, text:x.parts.join('\n\n')}))
    .filter(x=>clean(x.text.replace(/^\**[IVXLC]+\s*[-–—]\s*|^\**(§\s*\d+º?|Parágrafo único)\.?\**\s*/i,'')).replace(/^\(?revogad[oa].*$/i,'').length>12);
}
const unitCache=new Map();
function units(a){ let u=unitCache.get(a.id); if(!u){ u=unitsOf(a); unitCache.set(a.id,u); } return u; }
function deckUnits(d){
  const arts = d.saved ? [...saved].map(id=>BYID[id]).filter(Boolean) : BYCODE[d.c].filter(a=>a.k>=d.de && a.k<=d.ate);
  return arts.flatMap(units);
}
function stats(us){
  const now=Date.now(); let due=0,nw=0;
  for(const u of us){ const s=srs[u.id]; if(!s) nw++; else if(s.due<=now) due++; }
  return {due,nw,seen:us.length-nw,total:us.length};
}
function unitById(id){ const art=BYID[id.split('#')[0]]; return art ? units(art).find(u=>u.id===id)||null : null; }
function allDue(){
  const now=Date.now();
  return Object.keys(srs).filter(id=>srs[id] && srs[id].due<=now).sort((a,b)=>srs[a].due-srs[b].due).map(unitById).filter(Boolean);
}
const plural=(n,a,b)=>`${n} ${n===1?a:b}`;
const days=n=>n<=0?'agora':n===1?'amanhã':`em ${n} dias`;
let mode=store.get('mode','texto');
function renderDecks(){
  if(!ARTS.length) return;
  const due=allDue(); const started=Object.keys(srs).length>0;
  $('#today').innerHTML = due.length
    ? `<div class="tl">Para hoje</div><div class="tn">${plural(due.length,'ficha','fichas')} para revisar</div>
       <p>São fichas que você já viu e que chegou a hora de relembrar.</p><button class="go big" id="go-due">Revisar agora</button>`
    : started
      ? `<div class="tl">Para hoje</div><div class="tn">Revisões em dia</div><p>Nenhuma ficha para revisar agora. Se quiser, comece fichas novas escolhendo um trecho abaixo.</p>`
      : `<div class="tl">Primeira vez?</div><div class="tn">Escolha um trecho para começar</div><p>Sugestão para o 1º ano: comece pela LINDB, que é curta, ou pelos princípios fundamentais da Constituição.</p>`;
  const decks=[{id:'saved',nome:'Meus grifos',saved:true}, ...PRESETS];
  $('#decks').innerHTML = decks.map(d=>{
    if(d.saved && !saved.size)
      return `<div class="deck off"><span class="dbody"><span class="dn">Meus grifos</span><span class="dm">Ao ler um artigo, toque em Grifar e ele aparece aqui.</span></span></div>`;
    const st=stats(deckUnits(d));
    const sub=d.saved?plural(saved.size,'artigo grifado','artigos grifados'):`${CODE[d.c].sigla}, arts. ${d.de} a ${d.ate}`;
    const pct=st.total?Math.round(st.seen/st.total*100):0;
    const act = st.due ? `Revisar ${st.due}` : st.seen===0 ? 'Começar' : st.nw ? 'Continuar' : 'Concluído';
    return `<button class="deck" data-deck="${d.id}" aria-label="${esc(`${d.nome}. ${sub}. ${st.seen} de ${st.total} fichas vistas. ${act}`)}"><span class="dbody" aria-hidden="true"><span class="dn">${esc(d.nome)}</span>
      <span class="dm">${sub}</span>
      <span class="bar"><i style="width:${pct}%"></i></span>
      <span class="dm">${st.seen} de ${st.total} fichas já vistas</span></span>
      <span class="act${st.due?' due':''}${act==='Concluído'?' fin':''}" aria-hidden="true">${act}</span></button>`;
  }).join('');
  document.querySelectorAll('.modes [data-mode]').forEach(b=>b.setAttribute('aria-checked',b.dataset.mode===mode));
  if(!$('#cc-code').options.length) $('#cc-code').innerHTML = CODES.map(c=>`<option value="${c.id}">${c.sigla} · ${esc(c.nome)}</option>`).join('');
}
$('.modes').addEventListener('click',e=>{ const b=e.target.closest('[data-mode]'); if(!b) return; mode=b.dataset.mode; store.set('mode',mode); renderDecks(); });
$('#today').addEventListener('click',e=>{ if(e.target.closest('#go-due')) startSession({id:'due',nome:'Revisão do dia',due:true}); });
$('#decks').addEventListener('click',e=>{
  const b=e.target.closest('[data-deck]'); if(!b) return;
  const id=b.dataset.deck; startSession(id==='saved'?{id,nome:'Meus grifos',saved:true}:PRESETS.find(p=>p.id===id));
});
$('#cc-go').onclick=()=>{
  const c=$('#cc-code').value, x=+$('#cc-de').value||1, y=+$('#cc-ate').value||x;
  const de=Math.min(x,y), ate=Math.max(x,y);
  if(!deckUnits({c,de,ate}).length){ toast('Nenhum artigo nesse intervalo.'); return; }
  $('#cc-de').blur(); $('#cc-ate').blur();
  startSession({id:'custom',nome:`${CODE[c].sigla}, arts. ${de} a ${ate}`,c,de,ate});
};
let queue=[], done=0, total=0, shown=false, deckNow=null, tally=[0,0,0], inSession=false;
const NEW_PER=15, IV=[0,1,3,7,16,35,80];
function startSession(d){
  deckNow=d; const now=Date.now();
  if(d.due){ queue=allDue(); }
  else {
    const us=deckUnits(d);
    const due=us.filter(u=>srs[u.id]&&srs[u.id].due<=now).sort((a,b)=>srs[a.id].due-srs[b.id].due);
    queue=due.concat(us.filter(u=>!srs[u.id]).slice(0,NEW_PER));
  }
  done=0; total=queue.length; tally=[0,0,0]; missed.clear();
  inSession=true; pushLayer('session');
  $('#studyhome').hidden=true; $('#studyrun').hidden=false; showCard(); window.scrollTo(0,0);
}
function hideSession(){ if(!inSession) return; inSession=false; $('#studyrun').hidden=true; $('#studyhome').hidden=false; renderDecks(); window.scrollTo(0,0); }
function endSession(){ hideSession(); dropLayer('session'); }
function nextDays(u){ const b=(srs[u.id]||{b:0}).b; return [0, IV[Math.max(1,b)], IV[Math.min(IV.length-1,b+1)]]; }
const X_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
function showCard(){
  const el=$('#studyrun');
  const pos=Math.min(done+1,total);
  const head=`<div class="studyhead"><button class="xbtn" id="st-back" aria-label="Sair do estudo">${X_ICON}</button><span>${esc(deckNow.nome)}</span></div>
    <div class="sbar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="Progresso da sessão"><i style="width:${total?Math.round(done/total*100):100}%"></i></div>
    ${queue.length?`<div class="spos">Ficha ${pos} de ${total}${srs[queue[0].id]?' · revisão':' · nova'}</div>`:''}`;
  if(!queue.length){
    el.innerHTML = head + (total
      ? `<div class="done study"><h2>FINIS</h2><q>Dura lex, sed lex.</q>
         <p>Você terminou ${plural(total,'ficha','fichas')}: ${tally[2]} lembrou bem, ${tally[1]} com esforço e ${tally[0]} errou ao menos uma vez.</p>
         <p>Elas voltam para revisão nos próximos dias, na tela inicial das fichas.</p><button class="go" id="st-back2">Voltar</button></div>`
      : `<div class="done study"><h2>NIHIL HODIE</h2><p>Nada para estudar aqui agora: tudo deste trecho já está marcado para revisão em outro dia.</p><button class="go" id="st-back2">Voltar</button></div>`);
    $('#st-back2').focus(); return;
  }
  const u=queue[0], a=u.a; shown=false;
  const label=`Art. ${esc(a.n)}${u.sub?', '+esc(u.sub):''}`;
  const where=a.h?esc(lastHead(a.h)):'';
  const top=`<div class="ctop"><span class="sg">${CODE[a.c].sigla}</span><span class="sep">·</span>${esc(CODE[a.c].nome)}</div>`;
  let front,back;
  if(mode==='texto'){
    front=`${top}<div class="cw">${where}</div><div class="cl">${label}</div><p class="ask">O que diz este dispositivo?</p>`;
    back=`<div class="ans q lex">${fmt(u.text)}</div>`;
  } else {
    front=`${top}<p class="ask" style="margin-top:.6rem">De qual artigo é este trecho?</p><div class="q lex">${fmt(u.text)}</div>`;
    back=`<div class="ans"><div class="cw" style="margin:0">${where}</div><div class="cl" style="margin:0">${label}</div></div>`;
  }
  const nd=nextDays(u);
  el.innerHTML = head + `<div class="card">${front}<div id="st-back-face" hidden>${back}</div>
    <div class="reveal" id="st-reveal"><button id="st-show">Ver a resposta</button></div>
    <div class="rate" id="st-rate" hidden><div class="rq">Você lembrou?</div>
      <button class="r0" data-r="0">Não lembrei<small>volta ${days(nd[0])}</small></button>
      <button class="r1" data-r="1">Com esforço<small>volta ${days(nd[1])}</small></button>
      <button class="r2" data-r="2">Lembrei bem<small>volta ${days(nd[2])}</small></button></div></div>`;
  $('#st-show').focus();
}
function reveal(){ if(shown) return; shown=true; $('#st-back-face').hidden=false; $('#st-reveal').hidden=true; $('#st-rate').hidden=false; $('#st-rate button').focus(); }
const missed=new Set();
function rate(r){
  const u=queue.shift(); const s=srs[u.id]||{b:0,due:0}; const day=864e5, now=Date.now();
  if(r===0){ s.b=0; s.due=now; missed.add(u.id); queue.splice(Math.min(3,queue.length),0,u); }
  else { s.b = r===1 ? Math.max(1,s.b) : Math.min(IV.length-1,s.b+1); s.due=now+IV[s.b]*day; done++;
    tally[missed.has(u.id)?0:r]++; missed.delete(u.id); }
  srs[u.id]=s; store.set('srs',srs); askPersist(); showCard();
}
$('#studyrun').addEventListener('click',e=>{
  const t=e.target;
  if(t.closest('#st-back,#st-back2')) return endSession();
  if(t.closest('#st-show')) return reveal();
  const r=t.closest('[data-r]'); if(r) rate(+r.dataset.r);
});
document.addEventListener('keydown',e=>{
  if(!inSession || !$('#sheet').hidden) return;
  if(e.target.matches('input,textarea,select')) return;
  if((e.key===' '||e.key==='Enter') && !shown && queue.length && !e.target.closest('button')){ e.preventDefault(); reveal(); }
  else if(shown && ['1','2','3'].includes(e.key)) rate(+e.key-1);
});

/* ---------- backup do progresso ---------- */
$('#bk-save').onclick=async()=>{
  const body=JSON.stringify({app:'ad-legem',versao:1,salvo_em:new Date().toISOString(),saved:[...saved],srs,mode},null,0);
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
    if(d.app!=='ad-legem' || !Array.isArray(d.saved) || typeof d.srs!=='object' || !d.srs) throw new Error();
    const n=Object.keys(d.srs).length;
    if(!confirm(`Restaurar a cópia de ${new Date(d.salvo_em).toLocaleDateString('pt-BR')}? Ela tem ${d.saved.length} grifos e ${n} fichas, e substitui o progresso atual deste aparelho.`)) return;
    saved=new Set(d.saved.filter(id=>typeof id==='string'));
    srs={}; for(const [k,v] of Object.entries(d.srs)) if(v && typeof v.b==='number' && typeof v.due==='number') srs[k]={b:v.b,due:v.due};
    if(d.mode==='texto'||d.mode==='numero') mode=d.mode;
    store.set('saved',[...saved]); store.set('srs',srs); store.set('mode',mode); askPersist();
    renderDecks(); toast('Progresso restaurado.');
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
  if(v==='estudar' && $('#studyhome') && !$('#studyhome').hidden) renderDecks();
  window.scrollTo(0,0);
}
function go(v){
  if(v==='estudar'){
    if(inSession) return;                              // já está estudando
    if(!layers.includes('estudar')) pushLayer('estudar');
    showView('estudar');
  } else {
    if(inSession){ hideSession(); }
    const i=layers.indexOf('estudar'); if(i>=0) dropLayer('estudar');
    showView('buscar');
  }
}
function goHome(){
  hideSheet(); hideSession();
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
