/* Ad Legem — app.js
   Dados (data.json) → Buscar (estante, resultados, página do artigo) → Estudar (caderno, trilha,
   lição, prova, certidão) → Configurações → navegação com o botão voltar → início. */
(function(){
'use strict';
// HTML e JS precisam ser da mesma versão. Se o cache juntou versões diferentes, limpa só o
// cache de arquivos (o progresso fica no localStorage e não é tocado) e recarrega uma vez.
const BUILD='10';
if(document.documentElement.dataset.build!==BUILD){
  let tried=false; try{ tried=sessionStorage.getItem('adl-fix')===BUILD; sessionStorage.setItem('adl-fix',BUILD); }catch(e){}
  if(!tried){
    const clear = window.caches ? caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k)))) : Promise.resolve();
    clear.catch(()=>{}).then(()=>location.reload());
    return;
  }
}
const $ = s=>document.querySelector(s);
const $$ = s=>[...document.querySelectorAll(s)];
const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm = s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const cap1 = s=>s.charAt(0).toUpperCase()+s.slice(1);

/* ---------- persistência ---------- */
const store = {
  get(k,d){ try{ const v=localStorage.getItem('leiseca:'+k); return v!==null?JSON.parse(v):d; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem('leiseca:'+k, JSON.stringify(v)); }catch(e){ toast('Não foi possível salvar neste aparelho.'); } }
};
// Grifos por dispositivo: chave "artigo|bloco" (bloco 0 = caput) → { c: cor (y|g|p), at: data }.
let marks = store.get('marks',null) || {};
const MARK_COLORS=['y','g','p'];
const MARK_DEFAULT={y:'Importante',g:'Cai em prova',p:'Dúvida'};
let markNames = Object.assign({},MARK_DEFAULT,store.get('markNames',{}));
const markKey=(artId,b)=>artId+'|'+b;
const artOfKey=k=>k.slice(0,k.lastIndexOf('|'));
const marksOf=artId=>Object.keys(marks).filter(k=>artOfKey(k)===artId);
const hasMarks=artId=>{ for(const k in marks) if(artOfKey(k)===artId) return true; return false; };
function saveMarks(){ store.set('marks',marks); }
// grifos antigos (artigo inteiro) viram o caput grifado em amarelo
(function migrateSaved(){
  if(store.get('marks',null)) return;
  const old=store.get('saved',[]);
  if(Array.isArray(old) && old.length){ old.forEach(id=>{ if(typeof id==='string') marks[markKey(id,0)]={c:'y',at:0}; }); saveMarks(); }
})();
function askPersist(){
  if(askPersist.done || !navigator.storage || !navigator.storage.persist) return;
  askPersist.done=true;
  navigator.storage.persisted().then(p=>p||navigator.storage.persist()).catch(()=>{});
}
function toast(t){ const el=$('#toast'); el.textContent=t; el.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>{el.hidden=true;},2400); }

/* ---------- configurações ---------- */
const SET={
  theme:   store.get('theme',null),     // null = automático, 'light', 'dark'
  fs:      store.get('fs',0),           // 0, 1, 2
  hiderev: store.get('hiderev',true),
  notes:   store.get('notes',false),
  qmax:    store.get('qmax',8),
  qartigo: store.get('qartigo',true),
  palette: store.get('palette','classico'),   // classico, grafite, marinho, bordo, sepia
};
function setOpt(k,v){ SET[k]=v; store.set(k,v); applyLook(); refreshViews(); }

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
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DIAS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const dataDate = ()=>{ const m=(META&&META.gerado_em||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${m[3]}/${m[2]}/${m[1]}`:''; };

/* cada código tem a cor do couro da sua lombada, usada no app inteiro */
const LEATHER={cf:'#0F4A33',adct:'#3E4A1F',lindb:'#5A3A22',cc:'#1D2E4F',cp:'#6B1F2A',cpc:'#1F4A57',cpp:'#4A2440',cdc:'#6E5418',clt:'#34404A',eca:'#2A4C7A',ctn:'#2A2724'};
const SPINE={cf:'CONSTITUIÇÃO',adct:'TRANSITÓRIAS',lindb:'INTRODUÇÃO',cc:'CÓDIGO CIVIL',cp:'CÓDIGO PENAL',cpc:'PROC. CIVIL',cpp:'PROC. PENAL',cdc:'CONSUMIDOR',clt:'TRABALHO',eca:'CRIANÇA',ctn:'TRIBUTÁRIO'};
// como cada código é citado numa frase ("conforme o Código Civil")
const REF={cf:'a Constituição Federal',adct:'o ADCT',lindb:'a LINDB',cc:'o Código Civil',cp:'o Código Penal',cpc:'o Código de Processo Civil',cpp:'o Código de Processo Penal',cdc:'o Código de Defesa do Consumidor',clt:'a CLT',eca:'o ECA',ctn:'o Código Tributário Nacional'};
const cc=c=>LEATHER[c]||'#0F4A33';
const deRef=c=>{ const r=REF[c]||('o '+CODE[c].nome); return r.startsWith('a ')?'da '+r.slice(2):'do '+r.slice(2); };

/* ---------- texto da lei ---------- */
function lastHead(h){ const p=h.split(' › '); return (p[p.length-1]||'').replace(/^(TÍTULO|CAPÍTULO|SEÇÃO|Seção|Subseção|LIVRO|PARTE)\s+[IVXLC]+(\s*[-—–]\s*)?/i,'').trim() || p[p.length-1] || ''; }
function segs(a){ return (a.h||'').split(' › ').filter(Boolean).map(s=>{ const m=s.match(/^(.*?)\s+[—–-]\s+(.+)$/); return m?{label:m[1].trim(),title:m[2].trim()}:{label:'',title:s.trim()}; }); }
const sentence=t=>cap1(t.toLowerCase());
const plainTxt=t=>t.replace(/\*\([^)]*\)\*/g,'').replace(/\*+/g,'').replace(/[ \t]+/g,' ').trim();
const LABEL_RE=/^(?:[IVXLC]+\s*[-–—]\s*|§\s*\d+º?\.?\s*|Parágrafo único\.?\s*|[a-z]\)\s*)/i;
const isRevokedBlock=raw=>{ const b=raw.replace(/\*+/g,'').trim().replace(LABEL_RE,'').trim(); return !b || /^\(?\s*(revogad|vetad)/i.test(b) || !plainTxt(raw).replace(LABEL_RE,'').trim(); };
function clip(s,n){ if(s.length<=n) return s; const c=s.lastIndexOf(' ',n); return s.slice(0,c>40?c:n)+'…'; }
const ROMANS=['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'];
const roman=n=>ROMANS[n]||String(n);

// Corpo do artigo no formato de página de livro: capitular, incisos com o numeral na margem,
// notas de redação como notas de rodapé numeradas.
// Rótulo de um dispositivo para citação: "", "XI", "§ 2º", "parágrafo único", "alínea a".
function blockLabel(raw,i){
  if(i===0) return '';
  const b=plainTxt(raw); let m;
  if((m=b.match(/^([IVXLC]+)\s*[-–—]/))) return m[1];
  if((m=b.match(/^([a-z])\)/))) return 'alínea '+m[1];
  if((m=b.match(/^§\s*(\d+º?)/))) return '§ '+m[1];
  if(/^Parágrafo único/i.test(b)) return 'parágrafo único';
  return '';
}
const citation=(a,i)=>{ const l=blockLabel(a.t.split(/\n{2,}/)[i]||'',i); return `${CODE[a.c].sigla}, art. ${a.n}${l?', '+l:''}`; };
// Corpo do artigo no formato de página de livro: capitular, incisos com o numeral na margem,
// notas de redação como notas de rodapé. Com artId, cada dispositivo pode ser tocado para grifar.
function pageBody(blocks, dropcap, artId){
  const notes=[];
  const inl=s=>{
    s=esc(s);
    s=s.replace(/\*\((.+?)\)\*/g,(m,t)=>{ if(!SET.notes) return ''; notes.push(t); return `<sup class="fn">${notes.length}</sup>`; });
    s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+?)\*/g,'<em>$1</em>').replace(/\*+/g,'');
    return s.replace(/\s+(<sup)/g,'$1').trim();
  };
  const out=[]; let first=true;
  blocks.forEach((raw,bi)=>{
    const b=raw.trim(); if(!b) return;
    if(!first && isRevokedBlock(b)){
      if(SET.hiderev) return;
      const lab=(plainTxt(b).match(LABEL_RE)||[''])[0].replace(/[-–—]\s*$/,'').trim();
      out.push(`<p class="revk">${esc(lab)} <em>revogado</em></p>`); return;
    }
    const mk = artId ? marks[markKey(artId,bi)] : null;
    const at = artId ? ` data-b="${bi}" tabindex="0" aria-label="${esc((mk?`Grifado, ${markNames[mk.c]}. `:'Tocar para grifar. ')+clip(plainTxt(b),80))}"` : '';
    const mc = artId ? ` blk${mk?' mk mk-'+mk.c:''}` : '';
    const bare=b.replace(/^\*\*([^*]+)\*\*\s*/,'$1 ');
    let m;
    if((m=bare.match(/^([IVXLC]+)\s*[-–—]\s*/))) out.push(`<div class="inc${mc}"${at}><span class="num">${m[1]}</span><span>${inl(bare.slice(m[0].length))}</span></div>`);
    else if((m=bare.match(/^([a-z])\)\s*/))) out.push(`<div class="inc al${mc}"${at}><span class="num">${m[1]})</span><span>${inl(bare.slice(m[0].length))}</span></div>`);
    else if((m=bare.match(/^(§\s*\d+º?\.?|Parágrafo único\.?)\s*/i))) out.push(`<p class="par${mc}"${at}><span class="plabel">${esc(m[1].replace(/\.$/,''))}.</span> ${inl(bare.slice(m[0].length))}</p>`);
    else if(first && dropcap && /^[A-Za-zÀ-ÿ]/.test(bare)) out.push(`<p class="caput${mc}"${at}><span class="dropcap" aria-hidden="true">${esc(bare[0])}</span><span class="vh">${esc(bare[0])}</span>${inl(bare.slice(1))}</p>`);
    else out.push(`<p class="${mc.trim()}"${at}>${inl(bare)}</p>`);
    first=false;
  });
  return {html:out.join(''), notes};
}
// Página inteira de um artigo (ou de um trecho de artigo longo, numa lição).
function articleHTML(a, item, titleId){
  const S=segs(a), L=S.length?S[S.length-1]:null;
  const lv=S.find(s=>/^(LIVRO|PARTE)/i.test(s.label||s.title)) || S[0];
  const rhL=CODE[a.c].nome + (lv && lv!==L ? ' · '+(lv.label||lv.title) : '');
  const rhR=S.length>=2 ? S[S.length-2].title : '';
  const body=pageBody(item?item.raw:a.t.split(/\n{2,}/), !item || item.part===0, item?null:a.id);
  return `<div class="runhead"><span>${esc(rhL.toLowerCase())}</span><span>${esc(rhR.toLowerCase())}</span></div>
    ${L?`<div class="chap"><span class="chl">${esc(L.label)}</span><span class="cht">${esc(sentence(L.title))}</span></div>`:''}
    <h2 class="artno"${titleId?` id="${titleId}"`:''}>Art. ${esc(a.n)}${item&&item.sub?`<small>${esc(item.sub)}</small>`:''}</h2>
    ${item&&item.caput?`<p class="ctx">${esc(clip(item.caput,200))}</p>`:''}
    <div class="lexpage">${body.html}</div>
    ${body.notes.length?`<div class="footnotes">${body.notes.map((t,i)=>`<p><sup>${i+1}</sup> ${esc(t)}</p>`).join('')}</div>`:''}`;
}

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
  const hide=SET.hiderev;
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

function artCard(a,toks){
  const label=`${CODE[a.c].sigla}, artigo ${a.n}${a.r?', revogado':''}${hasMarks(a.id)?', grifado':''}. ${(a._p||'').slice(0,90)}`;
  return `<button class="art${a.r?' rev':''}" data-id="${esc(a.id)}" aria-label="${esc(label)}" style="--cc:${cc(a.c)}">
    <span class="mg" aria-hidden="true"><span class="chip">${CODE[a.c].sigla}</span><span class="an">${esc(a.n)}</span></span>
    <span aria-hidden="true">${a.h?`<span class="where">${esc(lastHead(a.h))}</span>`:''}
    <span class="snip">${snippet(a,toks||[])}</span>${a.r||hasMarks(a.id)?`<span class="tag">${a.r?'revogado':''}${a.r&&hasMarks(a.id)?' · ':''}${hasMarks(a.id)?'grifado':''}</span>`:''}</span></button>`;
}
let page=1, lastList=[], lastToks=[], lastHead_='';
function renderList(list,toks,head){
  lastList=list; lastToks=toks; lastHead_=head;
  const n=page*40;
  $('#results').innerHTML = head + list.slice(0,n).map(a=>artCard(a,toks)).join('') +
    (list.length>n?`<button class="more" id="more">Mostrar mais (${list.length-n})</button>`:'');
}
// A estante: um livro por código, com a altura ajustada ao título da lombada.
function bookHTML(c){
  const t=SPINE[c.id]||c.sigla, h=Math.max(150, 96 + t.length*11);
  return `<button class="book" data-open="${c.id}" style="--cc:${cc(c.id)};height:${h}px" aria-label="${esc(c.nome)}, ${BYCODE[c.id].length} artigos">
    <span class="band" aria-hidden="true"></span><span class="spine-t" aria-hidden="true">${esc(t)}</span>
    <span class="label" aria-hidden="true">${esc(c.sigla)}</span><span class="band" aria-hidden="true"></span></button>`;
}
function intro(){
  const one = filtered() ? [...active][0] : null;
  if(one){
    const list=BYCODE[one].filter(a=>!(SET.hiderev&&a.r));
    renderList(list,[],`<div class="codehead" style="--cc:${cc(one)}"><span class="ch-n">${esc(CODE[one].nome)}</span><span class="ch-s">${list.length} artigos, em ordem</span></div>`);
    return;
  }
  const half=Math.ceil(CODES.length/2);
  const shelf=list=>`<div class="shelf"><div class="books">${list.map(bookHTML).join('')}</div><div class="plank" aria-hidden="true"></div></div>`;
  $('#results').innerHTML = `<div class="rule-label"><span>ESTANTE</span></div>
    ${shelf(CODES.slice(0,half))}${shelf(CODES.slice(half))}
    <p class="stamp">Texto das leis de ${dataDate()}</p>`;
}
let tmr;
function runSearch(){
  if(!ARTS.length) return;
  const q=$('#q').value.trim();
  $('#hero').hidden = !!q || filtered();
  $('#tabs').hidden = !q && !filtered();
  syncResultsLayer();
  if(!q){ intro(); return; }
  buildIndex();
  const ref=parseRef(q);
  const toks=[...new Set(norm(q).split(/[^a-z0-9]+/).filter(t=>t.length>1 && !STOP.has(t)).map(stem))];
  let list=search(q);
  if(ref && ref.length){ const ids=new Set(ref.map(a=>a.id)); list=ref.concat(list.filter(a=>!ids.has(a.id))); }
  const head = list.length ? `${list.length} resultado${list.length>1?'s':''}` : 'Nada encontrado. Tente outra palavra ou toque em “Todos” para buscar em todos os códigos.';
  renderList(list, ref&&ref.length?[]:toks, `<p class="count" role="status">${head}</p>`);
}
$('#q').addEventListener('input',()=>{ clearTimeout(tmr); page=1; tmr=setTimeout(runSearch,180); });
$('#q').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); clearTimeout(tmr); runSearch(); $('#q').blur(); } });
$('#results').addEventListener('click',e=>{
  if(e.target.closest('#retry')){ boot(); return; }
  const op=e.target.closest('[data-open]'); if(op){ $('#q').value=''; setFilter(op.dataset.open); window.scrollTo(0,0); return; }
  if(e.target.closest('#more')){ page++; renderList(lastList,lastToks,lastHead_); return; }
  const b=e.target.closest('.art'); if(b) openArt(BYID[b.dataset.id]);
});

/* ---------- página do artigo ---------- */
let cur=null, lastFocus=null;
const BACKDROP=['header.top','main','.bnav'];
function excerpt(a){ return clip(plainTxt(a.t.split(/\n{2,}/)[0]||''),46); }
function openArt(a){
  if(!a) return; cur=a;
  const first=$('#sheet').hidden;
  if(first){ lastFocus=document.activeElement; pushLayer('sheet'); }
  const L=BYCODE[a.c], prev=L[a.p-1], next=L[a.p+1];
  $('#sheet').style.setProperty('--cc',cc(a.c));
  $('#sh-body').innerHTML = articleHTML(a,null,'pg-title');
  $('#sh-src').href = CODE[a.c].fonte;
  $('#pg-folio').textContent = `— ${a.p+1} —`;
  $('#sh-prev').hidden=!prev; $('#sh-next').hidden=!next;
  if(prev) $('#sh-prev').innerHTML=`<span class="tn">‹ Art. ${esc(prev.n)}</span><span class="tx">${esc(excerpt(prev))}</span>`;
  if(next) $('#sh-next').innerHTML=`<span class="tn">Art. ${esc(next.n)} ›</span><span class="tx">${esc(excerpt(next))}</span>`;
  setSave();
  $('#pg-scroll').scrollTop=0;
  if(first){
    $('#sheet').hidden=false; document.body.style.overflow='hidden';
    BACKDROP.forEach(s=>{ const el=$(s); if(el) el.inert=true; });
    $('#sh-close').focus({preventScroll:true});
  }
}
function hideSheet(){
  if($('#sheet').hidden) return;
  $('#sheet').hidden=true; document.body.style.overflow='';
  BACKDROP.forEach(s=>{ const el=$(s); if(el) el.inert=false; });
  if(lastFocus && lastFocus.isConnected) lastFocus.focus({preventScroll:true});
  if(!$('#v-buscar').hidden && lastList.length && $('#q').value.trim()){ const y=window.scrollY; renderList(lastList,lastToks,lastHead_); window.scrollTo(0,y); }
}
function closeArt(){ hideSheet(); dropLayer('sheet'); }
function setSave(){ $('#pg-ribbon').hidden=!(cur && hasMarks(cur.id)); }
$('#sh-close').onclick=closeArt;
document.addEventListener('keydown',e=>{
  if(!$('#marksheet').hidden){ if(e.key==='Escape') closeMarkSheet(); return; }
  if($('#sheet').hidden) return;
  if(e.key==='Escape') closeArt();
  if(e.key==='ArrowLeft' && cur && cur.p>0) openArt(BYCODE[cur.c][cur.p-1]);
  if(e.key==='ArrowRight' && cur && cur.p<BYCODE[cur.c].length-1) openArt(BYCODE[cur.c][cur.p+1]);
});
$('#sh-prev').onclick=()=>{ if(cur&&cur.p>0) openArt(BYCODE[cur.c][cur.p-1]); };
$('#sh-next').onclick=()=>{ if(cur&&cur.p<BYCODE[cur.c].length-1) openArt(BYCODE[cur.c][cur.p+1]); };
$('#sh-body').addEventListener('click',e=>{ const b=e.target.closest('[data-b]'); if(b && cur) openMarkSheet(cur, +b.dataset.b); });
$('#sh-body').addEventListener('keydown',e=>{ const b=e.target.closest('[data-b]'); if(b && cur && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); openMarkSheet(cur, +b.dataset.b); } });

/* ---------- paleta de grifo (vale para a página e para a aba Grifos) ---------- */
let markTarget=null;
function openMarkSheet(a, bi, onDone){
  markTarget={a,bi,onDone};
  const k=markKey(a.id,bi), mk=marks[k];
  $('#ms-title').textContent=citation(a,bi);
  $('#ms-colors').innerHTML=MARK_COLORS.map(c=>`<button class="ms-c" data-mc="${c}" aria-pressed="${!!(mk&&mk.c===c)}"><span class="sw-dot mk-${c}" aria-hidden="true"></span>${esc(markNames[c])}</button>`).join('');
  $('#ms-remove').hidden=!mk;
  if($('#marksheet').hidden){ pushLayer('mark'); $('#marksheet').hidden=false; }
  $('#ms-colors button').focus({preventScroll:true});
}
function hideMarkSheet(){ if($('#marksheet').hidden) return; $('#marksheet').hidden=true; const t=markTarget; markTarget=null; return t; }
function closeMarkSheet(){ const t=hideMarkSheet(); dropLayer('mark'); return t; }
function applyMark(c){
  const t=closeMarkSheet(); if(!t) return;
  const k=markKey(t.a.id,t.bi);
  if(c){ const isNew=!marks[k]; marks[k]={c,at:(marks[k]&&marks[k].at)||Date.now()}; toast(`Grifado: ${markNames[c]}`); askPersist(); }
  else { delete marks[k]; toast('Grifo removido.'); }
  saveMarks();
  if(cur && cur.id===t.a.id && !$('#sheet').hidden){ const y=$('#pg-scroll').scrollTop; openArt(cur); $('#pg-scroll').scrollTop=y; const el=$(`#sh-body [data-b="${t.bi}"]`); if(el) el.focus({preventScroll:true}); }
  if(t.onDone) t.onDone();
}
$('#marksheet').addEventListener('click',e=>{
  if(e.target.id==='marksheet' || e.target.closest('#ms-cancel')) return closeMarkSheet();
  const b=e.target.closest('[data-mc]'); if(b) return applyMark(b.dataset.mc);
  if(e.target.closest('#ms-remove')) return applyMark(null);
});
$('#sh-fs').onclick=()=>{ setOpt('fs',(SET.fs+1)%3); toast(['Texto normal','Texto grande','Texto maior'][SET.fs]); };

/* ---------- estudo ---------- */
/* ---------- estudo: trilhas → lições (ler + perguntas) → revisão ---------- */
const TRILHAS=[
  {id:'lindb',   nome:'LINDB',                              sub:'Lei de Introdução',  c:'lindb', de:1, ate:30},
  {id:'cf-fund', nome:'Princípios e direitos fundamentais', sub:'CF, arts. 1º a 17',  c:'cf',    de:1, ate:17},
  {id:'cc-geral',nome:'Código Civil',                       sub:'Parte Geral',        c:'cc',    de:1, ate:232},
  {id:'cp-geral',nome:'Código Penal',                       sub:'Parte Geral',        c:'cp',    de:1, ate:120},
];
const fullTrack=c=>({id:'all-'+c, nome:CODE[c].nome, sub:'Código completo', c, de:0, ate:1e9});
const trackById=id=>TRILHAS.find(t=>t.id===id) || (id&&id.startsWith('all-')&&CODE[id.slice(4)] ? fullTrack(id.slice(4)) : null);

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
// Agrupa os itens de leitura em lições de até 5 artigos. Uma lição nunca mistura capítulos
// (a versão antiga, "legacy", misturava; ela só é usada para converter o progresso salvo).
function groupLessons(items, legacy){
  const lessons=[]; let cur=null;
  const headOf=it=>it.a.h||'';
  for(const it of items){
    const newHead = cur && headOf(it)!==headOf(cur.items[cur.items.length-1]);
    if(!cur || cur.items.length>=5 || cur.len+it.len>3000 || (newHead && (!legacy || cur.items.length>=3))){
      cur={items:[],len:0}; lessons.push(cur);
    }
    cur.items.push(it); cur.len+=it.len;
  }
  return lessons;
}
const trackItems=t=>BYCODE[t.c].filter(a=>a.k>=t.de && a.k<=t.ate && !a.r).flatMap(readingItems);
function lessonsOf(t){
  if(lessonCache.has(t.id)) return lessonCache.get(t.id);
  const lessons=groupLessons(trackItems(t), false);
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

function questionsFor(items, t, seed, max){
  const labelsOf=it=>BYCODE[it.a.c];
  const qs=[];
  items.forEach(it=>{
    const list=labelsOf(it), p=it.a.p;
    const neighbors=list.slice(Math.max(0,p-4),p+5).filter(x=>!x.r).map(x=>'Art. '+x.n);
    const genItem={id:it.key, c:it.a.c, n:it.a.n, label:'Art. '+it.a.n+(it.sub?', '+it.sub:''), blocks:it.blocks};
    qs.push(...Perguntas.gerar(genItem,{max: items.length<=3?2:1, neighbors, seed, famous: it.part===0 && SET.qartigo}));
  });
  // embaralha de forma estável e limita
  const h=s=>{ let x=2166136261; for(const ch of s){ x^=ch.charCodeAt(0); x=Math.imul(x,16777619);} return x>>>0; };
  return qs.sort((a,b)=>h(seed+a.id)-h(seed+b.id)).slice(0,max);
}

/* progresso salvo */
let estudados=new Set(store.get('estudados',[])); // chaves dos trechos já estudados em lições concluídas
let rev=store.get('rev',{});                  // { idPergunta: { q, b, due } }
let curTrack=store.get('cur',null);
const IV=[1,3,7,16,35,80];                    // dias até a próxima revisão
const day=864e5;
const lessonDone=l=>l.items.every(it=>estudados.has(it.key));
const doneCount=t=>lessonsOf(t).filter(lessonDone).length;
// Converte o progresso antigo (índices de lições) para trechos estudados, uma única vez.
function migrateProgress(){
  const old=store.get('trilhas',null); if(!old || store.get('estudados',null)) return;
  for(const [id,idx] of Object.entries(old)){
    const t=trackById(id); if(!t || !Array.isArray(idx)) continue;
    const legacy=groupLessons(trackItems(t), true);
    idx.forEach(i=>{ const l=legacy[i]; if(l) l.items.forEach(it=>estudados.add(it.key)); });
  }
  store.set('estudados',[...estudados]);
}
function dueReviews(){ const now=Date.now(); return Object.values(rev).filter(r=>r&&r.q&&r.due<=now).sort((a,b)=>a.due-b.due); }
function nextLesson(t){ return lessonsOf(t).find(l=>!lessonDone(l)) || null; }
const plural=(n,a,b)=>`${n} ${n===1?a:b}`;

/* ----- caderno (início da aba Estudar) ----- */
let moreOpen=false;
function coverHTML(t){
  const ls=lessonsOf(t), n=doneCount(t), pct=ls.length?Math.round(n/ls.length*100):0;
  const prog=n===ls.length?'Concluída':`${n} de ${plural(ls.length,'lição','lições')}`;
  return `<button class="cover" data-track="${t.id}" style="--cc:${cc(t.c)}" aria-label="${esc(`${t.nome}, ${t.sub}. ${prog}`)}">
    <span class="cv-spine" aria-hidden="true"></span>
    <span class="cv-in" aria-hidden="true"><span class="cv-t">${esc(t.nome)}</span><span class="cv-s">${esc(t.sub)}</span>
    <span class="cv-p">${prog}</span><span class="cv-bar"><i style="width:${pct}%"></i></span></span></button>`;
}
function renderStudy(){
  if(!ARTS.length) return;
  const t=trackById(curTrack)||TRILHAS[0], nl=nextLesson(t), ls=lessonsOf(t), n=doneCount(t);
  const first=!curTrack, due=dueReviews(), d=new Date();
  const cont = `<section class="cover big" style="--cc:${cc(t.c)}" aria-label="${first?'Comece por aqui':'Continuar'}">
    <span class="cv-spine" aria-hidden="true"></span>
    <div class="cv-in">
      <div class="cv-k">${first?'COMECE POR AQUI':'CONTINUAR'}</div>
      <div class="cv-t">${esc(t.nome)}</div><div class="cv-s">${esc(t.sub)}</div>
      ${nl?`<div class="cv-l">Lição ${nl.i+1} de ${ls.length} · <i>${esc(nl.title)}</i></div>
        <div class="cv-m">${esc(nl.range)} · cerca de ${nl.minutes} min</div>
        <div class="cv-bar" aria-hidden="true"><i style="width:${ls.length?Math.round(n/ls.length*100):0}%"></i></div>
        <button class="cv-go" data-start="${t.id}|${nl.i}">${first?'Começar a primeira lição':'Começar lição'}</button>`
      :`<div class="cv-l">Matéria concluída</div><div class="cv-m">Escolha outra matéria abaixo.</div>`}
    </div></section>`;
  const nrev=Math.min(due.length,10);
  const ticket = due.length ? `<button class="ticket" id="go-rev"><span class="tk-n" aria-hidden="true">${nrev}</span>
      <span class="tk-t"><b>Revisão do dia</b><span>${plural(nrev,'pergunta','perguntas')} do que você já estudou</span></span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>` : '';
  $('#studyhome').innerHTML = `<div class="dateline">${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}</div>
    <h1 class="studyh">Caderno de estudos</h1>
    ${cont}${ticket}
    <div class="rule-label"><span>MATÉRIAS DO 1º ANO</span></div>
    <div class="covers">${TRILHAS.map(coverHTML).join('')}</div>
    <details class="more-mat" id="more-mat"${moreOpen?' open':''}><summary>Outras matérias: códigos completos</summary>
      <div class="covers" id="tracks-all">${moreOpen?CODES.map(c=>coverHTML(fullTrack(c.id))).join(''):''}</div></details>`;
  $('#more-mat').addEventListener('toggle',e=>{ moreOpen=e.target.open; if(moreOpen && !$('#tracks-all').innerHTML) $('#tracks-all').innerHTML=CODES.map(c=>coverHTML(fullTrack(c.id))).join(''); });
}

/* ----- trilha (o caminho de lições) ----- */
let trackOpen=null;
const BACK_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const X_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const CHECK_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function openTrack(id){ const t=trackById(id); if(!t) return; trackOpen=t; pushLayer('track'); renderTrack(true); }
function milestoneOf(l){ const S=segs(l.items[0].a), L=S[S.length-1]; if(!L) return ''; const lab=(L.label||'').replace(/^CAPÍTULO/i,'CAP.').replace(/^SEÇÃO/i,'SEÇ.').replace(/^TÍTULO/i,'TÍT.').replace(/^Subseção/i,'SUBSEÇ.'); return (lab?lab+' · ':'')+L.title.toUpperCase(); }
function renderTrack(scroll){
  const t=trackOpen, ls=lessonsOf(t), n=doneCount(t), nx=nextLesson(t);
  let lastMs=null;
  const items=ls.map(l=>{
    const ms=milestoneOf(l), msHTML = ms && ms!==lastMs ? `<li class="ms" aria-hidden="true"><span>${esc(ms)}</span></li>` : '';
    lastMs=ms;
    const done=lessonDone(l), isNext=nx&&nx.i===l.i;
    if(isNext) return msHTML+`<li class="node next"><span class="dot" aria-hidden="true">${l.i+1}</span>
      <div class="nextcard"><div class="nc-k">PRÓXIMA · LIÇÃO ${l.i+1}</div><div class="nc-t">${esc(l.title)}</div>
      <div class="nc-m">${esc(l.range)} · cerca de ${l.minutes} min · ler e responder</div>
      <button class="nc-go" data-start="${t.id}|${l.i}">Começar lição</button></div></li>`;
    return msHTML+`<li class="node${done?' done':''}"><span class="dot" aria-hidden="true">${done?CHECK_ICON:l.i+1}</span>
      <button class="nd-b" data-start="${t.id}|${l.i}"><span class="nd-t">${esc(l.title)}</span><span class="nd-m">Lição ${l.i+1} · ${esc(l.range)}${done?' · concluída':` · ${l.minutes} min`}</span></button></li>`;
  }).join('');
  $('#trackview').innerHTML=`<header class="trackhead" style="--cc:${cc(t.c)}">
      <button class="circ light" id="tr-back" aria-label="Voltar ao caderno">${BACK_ICON}</button>
      <div class="th-k">MATÉRIA</div><h2>${esc(t.nome)}</h2><div class="th-s">${esc(t.sub)}</div>
      <div class="th-p"><span class="th-bar" aria-hidden="true"><i style="width:${ls.length?Math.round(n/ls.length*100):0}%"></i></span><span>${n} de ${plural(ls.length,'lição','lições')}</span></div>
    </header><ol class="path" style="--cc:${cc(t.c)}">${items}</ol>`;
  $('#studyhome').hidden=true; $('#trackview').hidden=false; window.scrollTo(0,0);
  const nxt=$('#trackview .node.next'); if(scroll && nxt && nxt.getBoundingClientRect().top>window.innerHeight*.65) nxt.scrollIntoView({block:'center'});
}
function hideTrack(){ if(!trackOpen) return; trackOpen=null; $('#trackview').hidden=true; if(!inSession){ $('#studyhome').hidden=false; renderStudy(); } }

/* ----- sessão: lição (ler → prova → certidão), revisão do dia ou grifos ----- */
let S=null, inSession=false;
function startLesson(tid, li, reuse){
  const t=trackById(tid); const l=t&&lessonsOf(t)[li]; if(!l) return;
  curTrack=t.id; store.set('cur',curTrack);
  S={kind:'lesson', t, l, c:t.c, title:l.title, kicker:`${t.nome} · Lição ${l.i+1}`, items:l.items, ri:0, phase:'read',
     qs:questionsFor(l.items,t,t.id+'#'+l.items[0].key,SET.qmax), qi:0, answers:[]};
  if(reuse){ renderSession(); window.scrollTo(0,0); } else openSession();
}
function startReview(){
  const due=dueReviews().slice(0,10).map(r=>r.q);
  if(!due.length){ toast('Nada para revisar agora.'); return; }
  S={kind:'review', title:'Revisão do dia', kicker:'Caderno de estudos', items:[], ri:0, phase:'quiz', qs:due, qi:0, answers:[]}; openSession();
}
// Prova só com os trechos grifados (os do filtro atual da aba Grifos).
function startMarksPractice(keys){
  const items=[];
  keys.forEach(k=>{
    const a=BYID[artOfKey(k)]; if(!a) return;
    const raw=a.t.split(/\n{2,}/), bi=+k.slice(k.lastIndexOf('|')+1);
    const parts = bi===0 ? [raw[0]] : [raw[0], raw[bi]].filter(Boolean);
    items.push({key:k, a, raw:parts, blocks:parts.map(plainTxt), sub:blockLabel(raw[bi]||'',bi), part:bi===0?0:1, len:0});
  });
  const qs=questionsFor(items,null,'grifos'+new Date().toDateString(),Math.max(SET.qmax,10));
  if(!qs.length){ toast('Esses trechos ainda não rendem perguntas. Grife mais alguns.'); return; }
  go('estudar');
  S={kind:'grifos', title:'Meus grifos', kicker:'Grifos', items:[], ri:0, phase:'quiz', qs, qi:0, answers:[]}; openSession();
}
function openSession(){ inSession=true; pushLayer('session'); $('#studyhome').hidden=true; $('#trackview').hidden=true; $('#studyrun').hidden=false; renderSession(); window.scrollTo(0,0); }
function hideSession(){
  if(!inSession) return; inSession=false; S=null; $('#studyrun').hidden=true;
  if(trackOpen) renderTrack(false); else { $('#studyhome').hidden=false; renderStudy(); }
  window.scrollTo(0,0);
}
function endSession(){ hideSession(); dropLayer('session'); }

function sessionHead(){
  return `<div class="sess-head"><button class="xbtn" id="st-x" aria-label="Sair">${X_ICON}</button>
    <div class="sh-t"><span>${esc(S.kicker)}</span><i>${esc(S.title)}</i></div></div>`;
}
function answerSheet(){
  const marks=S.qs.map((q,i)=>{ const a=S.answers[i]; const st=a?(a.ok?'ok':'no'):(S.phase==='quiz'&&i===S.qi?'now':''); return `<span class="as"><span class="as-n">${roman(i+1)}</span><span class="as-o ${st}"></span></span>`; }).join('');
  const label=S.phase==='quiz'?`Folha de respostas: questão ${S.qi+1} de ${S.qs.length}`:'Folha de respostas';
  return `<div class="answersheet" role="img" aria-label="${label}">${marks}</div>`;
}
function renderSession(){
  const el=$('#studyrun');
  if(S.phase==='read'){
    const it=S.items[S.ri], a=it.a, last=S.ri===S.items.length-1;
    const dots=S.items.map((_,i)=>`<i class="${i<=S.ri?'on':''}"></i>`).join('');
    el.innerHTML=sessionHead()+`<div class="readprog"><span>LEITURA ${roman(S.ri+1)} DE ${roman(S.items.length)}</span><span class="rdots" aria-hidden="true">${dots}</span></div>
      <article class="leaf" style="--cc:${cc(a.c)}">${articleHTML(a,it)}</article>
      <div class="actions">${S.ri>0?`<button class="go ghost" id="rd-prev">Anterior</button>`:''}
        <button class="go" id="rd-next">${!last?'Próximo artigo':S.qs.length?`Ir para a prova (${S.qs.length} ${S.qs.length===1?'questão':'questões'})`:'Concluir lição'}</button></div>`;
    $('#rd-next').focus({preventScroll:true});
    return;
  }
  if(S.phase==='quiz'){
    const q=S.qs[S.qi], ans=S.answers[S.qi];
    el.innerHTML=sessionHead()+answerSheet()+questionHTML(q,ans,S.qi)+
      (ans?`<div class="actions"><button class="go" id="q-next">${S.qi<S.qs.length-1?'Próxima questão':'Ver resultado'}</button></div>`:'');
    (ans?$('#q-next'):el.querySelector('[data-v]')).focus({preventScroll:true});
    if(ans){ const fb=el.querySelector('.fb'); if(fb) requestAnimationFrame(()=>fb.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})); }
    return;
  }
  el.innerHTML=certidaoHTML();
  ($('#studyrun [data-start]')||$('#st-done')).focus({preventScroll:true});
}
function sentenceHTML(q,mid){ return `${q.pre}${esc(q.before)}${mid}${esc(q.after)}${q.post}`; }
function questionHTML(q,ans,i){
  const art=BYID[q.art.split('#')[0]];
  let inst, item, opts;
  const correctVal = q.type==='vf' ? String(q.truth) : q.right;
  if(q.type==='vf'){
    inst=`Julgue o item a seguir, conforme ${REF[q.c]||CODE[q.c].nome}.`;
    const mid = ans ? `<mark class="${q.truth?'good':'bad'}">${esc(q.shown)}</mark>${!q.truth?` <mark class="good">${esc(q.right)}</mark>`:''}` : `<span class="hot">${esc(q.shown)}</span>`;
    item=`<p class="qctx">${esc(q.label)}${q.ctx?` · ${esc(q.ctx)}`:''}</p><p class="qtext">${sentenceHTML(q,mid)}</p>`;
    opts=`<div class="ce" role="group" aria-label="Sua resposta">${[['true','C','Certo'],['false','E','Errado']].map(([v,l,t])=>{
      const cls = !ans?'':(v===correctVal?' right':(v===ans.v?' wrong':' dim'));
      return `<button class="ce-b${cls}" data-v="${v}" ${ans?'disabled':''} aria-label="${t}"><span class="oval">${l}</span><span class="ce-l">${t}</span></button>`; }).join('')}</div>`;
  } else {
    inst = q.type==='lacuna' ? `Assinale a palavra que completa o ${esc(q.label.replace(/^Art\./,'art.'))}.` : `Indique o artigo ${deRef(q.c)} que contém este trecho.`;
    item = q.type==='lacuna'
      ? `${q.ctx?`<p class="qctx">${esc(q.label)} · ${esc(q.ctx)}</p>`:''}<p class="qtext">${sentenceHTML(q, ans?`<mark class="good">${esc(q.right)}</mark>`:'<span class="blank" aria-label="lacuna">______</span>')}</p>`
      : `<p class="qtext">“${esc(q.excerpt)}”</p>`;
    opts=`<div class="alts">${q.options.map((o,k)=>{
      const cls = !ans?'':(o===correctVal?' right':(o===ans.v?' wrong':' dim'));
      const tag = !ans?'':(o===correctVal?'<span class="at-tag">gabarito</span>':(o===ans.v?'<span class="at-tag">sua resposta</span>':''));
      return `<button class="alt${cls}" data-v="${esc(o)}" ${ans?'disabled':''}><span class="oval">${'ABCD'[k]}</span><span class="at">${esc(o)}</span>${tag}</button>`; }).join('')}</div>`;
  }
  const fb = ans ? `<div class="fb ${ans.ok?'ok':'no'}" role="status"><b>${ans.ok?'Correto.':'Não é isso.'}</b> ${
      q.type==='vf' ? (q.truth?'O trecho está exatamente como na lei.':`A lei diz «${esc(q.right)}», não «${esc(q.shown)}».`)
      : q.type==='lacuna' ? `A palavra da lei é «${esc(q.right)}».` : `É o ${esc(q.right)}.`}
      ${art?` <button class="linkbtn" data-art="${esc(art.id)}">Ler o artigo inteiro</button>`:''}</div>` : '';
  return `<section class="question" style="--cc:${cc(q.c)}" aria-label="Questão ${i+1}">
    <div class="rule-label q"><h2>QUESTÃO ${roman(i+1)}</h2></div><p class="qinst">${inst}</p>
    <div class="qitem"><span class="qn" aria-hidden="true">${i+1}</span><div>${item}</div></div>${opts}${fb}</section>`;
}
function porExtenso(n,fem){ if(n===0) return fem?'nenhuma':'nenhum'; return Perguntas.extenso(n,fem); }
function certidaoHTML(){
  const ok=S.answers.filter(a=>a&&a.ok).length, n=S.qs.length, d=new Date();
  const misses=S.qs.map((q,i)=>({q,a:S.answers[i]})).filter(x=>x.a&&!x.a.ok);
  const what = S.kind==='lesson'
    ? `${n?'':'a leitura d'}a <b>Lição ${S.l.i+1} · ${esc(S.l.title)}</b>, ${deRef(S.c)}, ${esc(S.l.range)}`
    : S.kind==='review' ? 'a <b>revisão do dia</b>' : 'a <b>prática dos artigos grifados</b>';
  const nx = S.kind==='lesson' ? nextLesson(S.t) : null;
  const missLine=q=> q.type==='artigo' ? `“${esc(clip(q.excerpt,60))}” é do ${esc(q.right)}.` : `${q.type==='vf'&&!q.truth?`o texto diz «${esc(q.right)}», não «${esc(q.shown)}».`:`a palavra da lei é «${esc(q.right)}».`}`;
  return `<section class="certidao" aria-label="Certidão de conclusão">
      <span class="corner tl" aria-hidden="true"></span><span class="corner tr" aria-hidden="true"></span><span class="corner bl" aria-hidden="true"></span><span class="corner br" aria-hidden="true"></span>
      <div class="ce-k">AD LEGEM</div><h2 class="ce-h">CERTIDÃO</h2><div class="ce-s">de conclusão${S.kind==='lesson'?' de lição':''}</div>
      <p class="ce-txt">Certifica-se, para os devidos fins, que foi concluída ${what}${n?', com o seguinte resultado:':'.'}</p>
      ${n?`<div class="ce-score"><span class="big">${ok}</span><span>de ${n}</span></div>
        <p class="ce-ext">${porExtenso(ok,false)} ${ok===1?'acerto':'acertos'} em ${porExtenso(n,true)} ${n===1?'questão':'questões'}</p>`:''}
      ${misses.length?`<div class="ce-miss"><div class="ce-mh">Para rever amanhã</div>${misses.map(x=>`<p><b>${x.q.type==='artigo'?esc(CODE[x.q.c].sigla):esc(x.q.label)}</b>: ${missLine(x.q)}</p>`).join('')}</div>`:''}
      <div class="ce-foot"><div class="ce-sign"><span>Lavrada em ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}.</span><span class="ce-line"></span><span class="ce-ad">AD LEGEM</span></div>
      <img class="ce-seal" src="seal.svg" alt="Selo do Ad Legem" width="104" height="104"></div>
    </section>
    <q class="ce-q">${!n||ok===n?'Dura lex, sed lex.':'Errando se aprende.'}</q>
    <div class="actions static">${nx?`<button class="go" data-start="${S.t.id}|${nx.i}">Próxima lição</button>`:''}<button class="go ghost" id="st-done">${S.kind==='lesson'&&trackOpen?'Voltar à matéria':'Voltar ao caderno'}</button></div>`;
}
function answer(v){
  const q=S.qs[S.qi]; if(S.answers[S.qi]) return;
  const ok = q.type==='vf' ? String(q.truth)===v : v===q.right;
  S.answers[S.qi]={v,ok};
  const r=rev[q.id]||{q,b:-1,due:0}; r.q=q;
  if(ok){ r.b=Math.min(IV.length-1,r.b+1); r.due=Date.now()+IV[r.b]*day; } else { r.b=-1; r.due=Date.now()+day; }
  rev[q.id]=r; store.set('rev',rev); askPersist();
  renderSession();
}
function nextStep(){
  if(S.phase==='read'){
    if(S.ri<S.items.length-1) S.ri++;
    else if(S.qs.length){ S.phase='quiz'; S.qi=0; }
    else { finishLesson(); S.phase='result'; }
  } else if(S.phase==='quiz'){
    if(S.qi<S.qs.length-1) S.qi++; else { finishLesson(); S.phase='result'; }
  }
  renderSession(); window.scrollTo(0,0);
}
function finishLesson(){
  if(S.kind!=='lesson') return;
  S.l.items.forEach(it=>estudados.add(it.key)); store.set('estudados',[...estudados]);
}
$('#studyrun').addEventListener('click',e=>{
  e.stopPropagation();   // a tela é redesenhada; sem isso o clique "vaza" para o tratador da aba
  const t=e.target;
  if(t.closest('#st-x,#st-done')) return endSession();
  if(t.closest('#rd-next')) return nextStep();
  if(t.closest('#rd-prev')){ S.ri=Math.max(0,S.ri-1); renderSession(); window.scrollTo(0,0); return; }
  if(t.closest('#q-next')) return nextStep();
  const o=t.closest('[data-v]'); if(o && !o.disabled) return answer(o.dataset.v);
  const la=t.closest('[data-art]'); if(la) return openArt(BYID[la.dataset.art]);
  const st=t.closest('[data-start]'); if(st){ const [tid,li]=st.dataset.start.split('|'); startLesson(tid,+li,true); }
});
$('#v-estudar').addEventListener('click',e=>{
  const st=e.target.closest('[data-start]'); if(st){ const [tid,li]=st.dataset.start.split('|'); startLesson(tid,+li); return; }
  const tr=e.target.closest('[data-track]'); if(tr){ openTrack(tr.dataset.track); return; }
  if(e.target.closest('#tr-back')){ hideTrack(); dropLayer('track'); return; }
  if(e.target.closest('#go-rev')) return startReview();
});
document.addEventListener('keydown',e=>{
  if(!inSession || !S || !$('#sheet').hidden || !$('#settings').hidden || e.target.matches('input,textarea,select')) return;
  if(S.phase==='quiz' && !S.answers[S.qi] && /^[1-4]$/.test(e.key)){ const o=$$('#studyrun [data-v]')[+e.key-1]; if(o) answer(o.dataset.v); }
});

/* ---------- aba Grifos: o fichário de recortes ---------- */
const GF={sort:'lei', color:'*', code:'*'};
function fmtDate(t){ if(!t) return ''; const d=new Date(t); return `${d.getDate()} de ${MESES[d.getMonth()]}`; }
function markList(){
  const list=Object.entries(marks).map(([k,v])=>{ const a=BYID[artOfKey(k)]; if(!a) return null; return {k, a, bi:+k.slice(k.lastIndexOf('|')+1), c:v.c, at:v.at||0}; }).filter(Boolean);
  const codeOrder=Object.fromEntries(CODES.map((c,i)=>[c.id,i]));
  return list.sort(GF.sort==='lei' ? (x,y)=>(codeOrder[x.a.c]-codeOrder[y.a.c]) || (x.a.p-y.a.p) || (x.bi-y.bi) : (x,y)=>(y.at-x.at) || (x.a.p-y.a.p));
}
const filteredMarks=()=>markList().filter(m=>(GF.color==='*'||m.c===GF.color)&&(GF.code==='*'||m.a.c===GF.code));
function clipHTML(m){
  const raw=m.a.t.split(/\n{2,}/)[m.bi]||'';
  const text=plainTxt(raw).replace(LABEL_RE,'').trim();
  const where=citation(m.a,m.bi).replace(/^[^,]+,\s*art\./,'Art.');
  return `<article class="clip" style="--cc:${cc(m.a.c)}">
    <div class="cl-h"><span class="chip">${esc(CODE[m.a.c].sigla)}</span><b>${esc(where)}</b>${m.at?`<span class="cl-d">${fmtDate(m.at)}</span>`:''}</div>
    <p class="cl-t"><span class="mk mk-${m.c}">${esc(text)}</span></p>
    <div class="cl-a">
      <button data-gact="open" data-k="${esc(m.k)}">Abrir artigo</button>
      <button data-gact="copy" data-k="${esc(m.k)}">Copiar citação</button>
      <button data-gact="edit" data-k="${esc(m.k)}" aria-label="${esc(markNames[m.c])}: trocar cor ou remover"><span class="sw-dot mk-${m.c}" aria-hidden="true"></span>${esc(markNames[m.c])}</button>
    </div></article>`;
}
function renderGrifos(){
  if(!ARTS.length) return;
  const all=markList();
  if(GF.code!=='*' && !all.some(m=>m.a.c===GF.code)) GF.code='*';
  const shown=filteredMarks();
  const codes=[...new Set(all.map(m=>m.a.c))];
  const chip=(grp,val,label,on,extra='')=>`<button class="fchip" data-gf="${grp}" data-val="${val}" aria-pressed="${on}">${extra}${label}</button>`;
  let body='';
  if(!all.length){
    body=`<div class="empty"><p>Nenhum grifo ainda.</p><p class="how">Abra um artigo e toque num trecho (caput, inciso ou parágrafo) para grifar.</p></div>`;
  } else if(!shown.length){
    body=`<p class="how">Nenhum grifo com esse filtro.</p>`;
  } else if(GF.sort==='lei'){
    let last=null;
    body=shown.map(m=>{ const h = m.a.c!==last ? `<div class="codehead sm" style="--cc:${cc(m.a.c)}"><span class="ch-n">${esc(CODE[m.a.c].nome)}</span></div>` : ''; last=m.a.c; return h+clipHTML(m); }).join('');
  } else body=shown.map(clipHTML).join('');
  $('#v-grifos').innerHTML=`<h1 class="studyh">Grifos</h1>
    ${all.length?`<p class="gf-count">${all.length} ${all.length===1?'trecho grifado':'trechos grifados'}</p>
    <div class="gf-ctrl">
      <div class="seg sm" role="radiogroup" aria-label="Ordem">${['lei','rec'].map(v=>`<button role="radio" data-gf="sort" data-val="${v}" aria-checked="${GF.sort===v}">${v==='lei'?'Ordem da lei':'Recentes'}</button>`).join('')}</div>
      <div class="fchips" role="group" aria-label="Filtrar por cor">${chip('color','*','Todas',GF.color==='*')}${MARK_COLORS.map(c=>chip('color',c,esc(markNames[c]),GF.color===c,`<span class="sw-dot mk-${c}" aria-hidden="true"></span>`)).join('')}</div>
      ${codes.length>1?`<div class="fchips" role="group" aria-label="Filtrar por código">${chip('code','*','Todos',GF.code==='*')}${codes.map(c=>chip('code',c,esc(CODE[c].sigla),GF.code===c)).join('')}</div>`:''}
    </div>`:''}
    <div class="clips">${body}</div>
    ${shown.length?`<div class="actions static gf-end"><button class="go" id="gf-practice">Praticar ${shown.length===1?'este grifo':`estes ${shown.length} grifos`}</button></div>`:''}`;
}
$('#v-grifos').addEventListener('click',async e=>{
  const f=e.target.closest('[data-gf]'); if(f){ GF[f.dataset.gf]=f.dataset.val; renderGrifos(); return; }
  if(e.target.closest('#gf-practice')) return startMarksPractice(filteredMarks().map(m=>m.k));
  const b=e.target.closest('[data-gact]'); if(!b) return;
  const k=b.dataset.k, a=BYID[artOfKey(k)], bi=+k.slice(k.lastIndexOf('|')+1); if(!a) return;
  if(b.dataset.gact==='open'){ openArt(a); requestAnimationFrame(()=>{ const el=$(`#sh-body [data-b="${bi}"]`); if(el) el.scrollIntoView({block:'center'}); }); }
  else if(b.dataset.gact==='edit') openMarkSheet(a,bi,renderGrifos);
  else if(b.dataset.gact==='copy'){
    const txt=`“${plainTxt(a.t.split(/\n{2,}/)[bi]||'').replace(LABEL_RE,'').trim()}” (${citation(a,bi)})`;
    try{ await navigator.clipboard.writeText(txt); toast('Citação copiada.'); }catch(err){ toast('Não foi possível copiar.'); }
  }
});

/* ---------- configurações (a ficha) ---------- */
function renderSettings(){
  const th=SET.theme||'auto';
  $$('#settings [data-set]').forEach(el=>{
    const k=el.dataset.set;
    if(el.matches('input[type=checkbox]')) el.checked=!!SET[k];
    else { const v=el.dataset.val; const on = k==='theme' ? v===th : String(SET[k])===v; el.setAttribute('aria-checked',on); }
  });
  $('#set-date').textContent=dataDate();
  $$('#settings [data-markname]').forEach(inp=>{ if(document.activeElement!==inp) inp.value=markNames[inp.dataset.markname]; });
}
function openSettings(){
  if(!$('#settings').hidden) return;
  pushLayer('settings'); renderSettings();
  $('#settings').hidden=false; document.body.style.overflow='hidden';
  BACKDROP.forEach(s=>{ const el=$(s); if(el) el.inert=true; });
  $('#set-close').focus({preventScroll:true});
}
function hideSettings(){
  if($('#settings').hidden) return;
  $('#settings').hidden=true; if($('#sheet').hidden){ document.body.style.overflow=''; BACKDROP.forEach(s=>{ const el=$(s); if(el) el.inert=false; }); }
  $('#menubtn').focus({preventScroll:true});
}
$('#menubtn').onclick=openSettings;
$('#set-close').onclick=()=>{ hideSettings(); dropLayer('settings'); };
$('#settings').addEventListener('click',e=>{
  const b=e.target.closest('button[data-set]'); if(!b) return;
  const k=b.dataset.set, v=b.dataset.val;
  if(k==='theme') setOpt('theme', v==='auto'?null:v);
  else if(k==='palette') setOpt('palette', v);
  else setOpt(k, +v);
  renderSettings();
});
$('#settings').addEventListener('input',e=>{
  const inp=e.target.closest('[data-markname]'); if(!inp) return;
  const c=inp.dataset.markname, v=inp.value.trim().slice(0,24);
  markNames[c]=v||MARK_DEFAULT[c]; store.set('markNames',markNames);
});
$('#settings').addEventListener('change',e=>{
  const c=e.target.closest('input[type=checkbox][data-set]'); if(!c) return;
  setOpt(c.dataset.set, c.checked);
});

/* ---------- backup do progresso ---------- */
function legacyToKeys(trilhasObj){
  const keys=new Set();
  for(const [id,idx] of Object.entries(trilhasObj||{})){
    const t=trackById(id); if(!t || !Array.isArray(idx)) continue;
    const legacy=groupLessons(trackItems(t), true);
    idx.forEach(i=>{ const l=legacy[i]; if(l) l.items.forEach(it=>keys.add(it.key)); });
  }
  return keys;
}
$('#bk-save').onclick=async()=>{
  const body=JSON.stringify({app:'ad-legem',versao:4,salvo_em:new Date().toISOString(),marks,markNames,estudados:[...estudados],rev,cur:curTrack});
  const name=`ad-legem-progresso-${new Date().toISOString().slice(0,10)}.json`;
  const file=new File([body],name,{type:'application/json'});
  try{ if(navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:'Progresso do Ad Legem'}); return; } }
  catch(e){ if(e && e.name==='AbortError') return; }
  const url=URL.createObjectURL(file); const a=document.createElement('a'); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
  toast('Cópia salva nos downloads.');
};
$('#bk-load').onclick=()=>$('#bk-file').click();
$('#bk-file').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try{
    const d=JSON.parse(await f.text());
    if(d.app!=='ad-legem' || !(d.marks || Array.isArray(d.saved))) throw new Error();
    const newMarks={};
    if(d.marks && typeof d.marks==='object'){ for(const [k,v] of Object.entries(d.marks)) if(v && MARK_COLORS.includes(v.c) && k.includes('|')) newMarks[k]={c:v.c,at:+v.at||0}; }
    else d.saved.forEach(id=>{ if(typeof id==='string') newMarks[markKey(id,0)]={c:'y',at:0}; });
    const keys = Array.isArray(d.estudados) ? new Set(d.estudados.filter(x=>typeof x==='string')) : legacyToKeys(d.trilhas);
    if(!confirm(`Restaurar a cópia de ${new Date(d.salvo_em).toLocaleDateString('pt-BR')}? Ela tem ${Object.keys(newMarks).length} grifos e substitui o progresso atual deste aparelho.`)) return;
    marks=newMarks; if(d.markNames) markNames=Object.assign({},MARK_DEFAULT,d.markNames);
    estudados=keys;
    rev={}; for(const [k,v] of Object.entries(d.rev||{})) if(v && v.q && typeof v.due==='number') rev[k]={q:v.q,b:+v.b||0,due:v.due};
    curTrack=typeof d.cur==='string'?d.cur:null;
    saveMarks(); store.set('markNames',markNames); store.set('estudados',[...estudados]); store.set('rev',rev); store.set('cur',curTrack); askPersist();
    refreshViews(); toast('Progresso restaurado.');
  }catch(err){ toast('Este arquivo não é uma cópia válida do Ad Legem.'); }
};
$('#bk-reset').onclick=()=>{
  if(!confirm('Apagar as lições concluídas e as revisões deste aparelho? Os grifos continuam.')) return;
  estudados=new Set(); rev={}; curTrack=null;
  store.set('estudados',[]); store.set('rev',{}); store.set('cur',null);
  refreshViews(); toast('Progresso apagado.');
};

/* ---------- navegação e botão voltar ----------
   Cada camada aberta (resultados, aba Estudar, matéria, sessão, artigo, configurações) é uma entrada
   no histórico: o "voltar" do Android fecha a camada de cima em vez de sair do app. */
const layers=[]; let skipPops=0, pendingPush=[];
function pushLayer(name){
  layers.push(name);
  if(skipPops) pendingPush.push(layers.length); else history.pushState({adl:layers.length},'');
}
function dropLayer(name){
  const i=layers.lastIndexOf(name); if(i<0) return;
  const n=layers.length-i; layers.length=i; skipPops++; history.go(-n);
}
window.addEventListener('popstate',()=>{
  if(skipPops){ skipPops--; if(!skipPops && pendingPush.length){ pendingPush.forEach(n=>history.pushState({adl:n},'')); pendingPush=[]; } return; }
  const name=layers.pop();
  if(name==='mark') hideMarkSheet();
  else if(name==='sheet') hideSheet();
  else if(name==='settings') hideSettings();
  else if(name==='session') hideSession();
  else if(name==='track') hideTrack();
  else if(name==='tab') showView('buscar');
  else if(name==='results'){ $('#q').value=''; active=allCodes(); renderTabs(); page=1; runSearch(); window.scrollTo(0,0); }
});
function syncResultsLayer(){
  const on = !!$('#q').value.trim() || filtered();
  if(on && !layers.includes('results')) pushLayer('results');
  else if(!on && layers[layers.length-1]==='results') dropLayer('results');
}
let curView='buscar';
function showView(v){
  curView=v;
  ['buscar','estudar','grifos'].forEach(x=>$('#v-'+x).hidden = x!==v);
  $$('[data-go]').forEach(b=>{ if(b.classList.contains('mark')) return; const on=b.dataset.go===v; b.setAttribute('aria-current', on?'page':'false'); const s=b.querySelector('span'); if(s) s.className=on?'hl':''; });
  if(v==='estudar' && !$('#studyhome').hidden) renderStudy();
  if(v==='grifos') renderGrifos();
  window.scrollTo(0,0);
}
// Estudar e Grifos ficam numa entrada "tab" do histórico, acima da busca: o voltar leva à busca.
function go(v){
  if(v==='estudar' && inSession && curView==='estudar') return;
  if(v!=='estudar' || !inSession){
    if(inSession){ inSession=false; S=null; $('#studyrun').hidden=true; }
    if(trackOpen){ trackOpen=null; $('#trackview').hidden=true; }
    $('#studyhome').hidden=false;
  }
  const i=layers.indexOf('tab');
  if(v==='buscar'){ if(i>=0) dropLayer('tab'); }
  else if(i<0) pushLayer('tab');
  else if(i<layers.length-1) dropLayer(layers[i+1]);
  showView(v);
}
function goHome(){
  hideMarkSheet(); hideSheet(); hideSettings(); inSession=false; S=null; trackOpen=null;
  $('#studyrun').hidden=true; $('#trackview').hidden=true; $('#studyhome').hidden=false;
  if(layers.length){ const n=layers.length; layers.length=0; skipPops++; history.go(-n); }
  $('#q').value=''; if(CODES.length){ active=allCodes(); renderTabs(); }
  showView('buscar'); page=1; runSearch();
}
$$('[data-go]').forEach(b=>b.addEventListener('click',e=>{ e.preventDefault(); if(b.classList.contains('mark')) goHome(); else go(b.dataset.go); }));

/* ---------- aparência: tema e tamanho do texto ---------- */
const mq=matchMedia('(prefers-color-scheme: dark)');
function applyLook(){
  const root=document.documentElement;
  if(SET.theme) root.dataset.theme=SET.theme; else delete root.dataset.theme;
  const dark = SET.theme ? SET.theme==='dark' : mq.matches;
  root.classList.toggle('isdark',dark);
  $$('meta[name="theme-color"]').forEach(m=>{ m.content = dark?'#0F1A15':'#FCFBF8'; });
  root.dataset.fs=Math.max(0,Math.min(2,SET.fs|0));
  root.dataset.palette=SET.palette||'classico';
}
// O selo é desenhado em linha, com as cores da paleta escolhida.
let SEAL=null;
function swapSeals(){
  if(!SEAL) return;
  $$('img[src="seal.svg"]').forEach(img=>{
    const t=document.createElement('template');
    t.innerHTML=SEAL.replace('<svg ',`<svg class="seal ${img.className}" width="${img.getAttribute('width')||''}" height="${img.getAttribute('height')||''}" ${img.alt?`role="img" aria-label="${esc(img.alt)}"`:'aria-hidden="true"'} `);
    img.replaceWith(t.content.firstElementChild);
  });
}
fetch('seal.svg').then(r=>r.ok?r.text():null).then(t=>{
  if(!t) return;
  SEAL=t.replace(/<\?xml[^>]*>/,'').replace(/ width="\d+" height="\d+"/,'').replace(/#0F4A33/gi,'var(--seal-bg)').replace(/#C9A13B/gi,'var(--seal-ring)').replace(/#F4EDD8/gi,'var(--seal-ink)');
  swapSeals();
  new MutationObserver(()=>{ if(document.querySelector('img[src="seal.svg"]')) swapSeals(); }).observe(document.body,{childList:true,subtree:true});
}).catch(()=>{});

if(mq.addEventListener) mq.addEventListener('change',applyLook);
// Redesenha o que estiver na tela depois de mudar uma configuração.
function refreshViews(){
  if(!ARTS.length) return;
  if(!$('#sheet').hidden && cur) openArt(cur);
  if(!$('#v-buscar').hidden){ const y=window.scrollY; if($('#q').value.trim()||filtered()) runSearch(); else intro(); window.scrollTo(0,y); }
  if(!$('#v-grifos').hidden) renderGrifos();
  if(!$('#v-estudar').hidden){
    if(inSession && S) renderSession();
    else if(trackOpen) renderTrack(false);
    else renderStudy();
  }
}

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
  migrateProgress();
  active=allCodes(); renderTabs(); runSearch();
  setTimeout(buildIndex,400);
}
applyLook();
history.replaceState({adl:0},'',location.pathname+location.search);
showView('buscar');
boot();
if('serviceWorker' in navigator && window.isSecureContext){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
})();
