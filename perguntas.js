/* Ad Legem — gerador de perguntas por regras (sem IA).
   Recebe um trecho de lei e devolve perguntas de três tipos:
   - "vf": certo ou errado, com uma palavra ou número trocado;
   - "lacuna": completar o trecho escolhendo entre opções;
   - "artigo": qual é o artigo (só para artigos muito conhecidos).
   Funciona no navegador (window.Perguntas) e no Node (module.exports), para testes. */
(function (root) {
  'use strict';

  /* ---------- aleatoriedade reproduzível (mesma lição gera as mesmas perguntas) ---------- */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = hash(seed); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function shuffle(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- números por extenso ---------- */
  const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function extenso(n, fem) {
    if (n === 100) return 'cem';
    const parts = [];
    const c = Math.floor(n / 100), r = n % 100;
    if (c) parts.push(fem && c > 1 ? C[c].replace(/os$/, 'as') : C[c]);
    if (r) {
      if (r < 20) parts.push(U[r]);
      else { parts.push(D[Math.floor(r / 10)]); if (r % 10) parts.push(U[r % 10]); }
    }
    let s = parts.join(' e ');
    if (fem) s = s.replace(/\bum$/, 'uma').replace(/\bdois$/, 'duas');
    return s;
  }
  const WORDNUM = {};
  for (let n = 1; n <= 400; n++) { WORDNUM[extenso(n, false)] = n; WORDNUM[extenso(n, true)] = n; }
  WORDNUM['catorze'] = 14;
  const WORD_RE = Object.keys(WORDNUM).sort((a, b) => b.length - a.length).map(w => w.replace(/ /g, '\\s+')).join('|');

  const UNIT = '(dias?|anos?|meses|m[eê]s|horas?)';
  const UNITNC = '(?:dias?|anos?|meses|m[eê]s|horas?)';
  const L = '[A-Za-zÀ-ÿ]';
  // "16 (dezesseis) anos", "45 dias", "quarenta e cinco dias", "6 (seis) a 20 (vinte) anos"
  const NUM_RE = new RegExp(`(?<!${L}|\\d|[.,/º°§])(\\d{1,3})(?:\\s*\\((${WORD_RE})\\))?(?=\\s*(?:\\(|${UNITNC}|a\\s+\\d|e\\s+\\d))|(?<!${L})(${WORD_RE})(?=\\s+${UNITNC}(?!${L}))`, 'giu');
  const POOL = {
    dias: [2, 3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120, 180],
    anos: [2, 3, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 21, 25, 30, 35, 40, 50, 60, 65, 70, 75, 80],
    meses: [1, 2, 3, 4, 6, 9, 12, 18, 24, 36],
    horas: [6, 12, 24, 48, 72]
  };
  function unitAfter(text, end) {
    const m = text.slice(end, end + 45).match(new RegExp(UNIT, 'iu'));
    if (!m) return null;
    const u = m[1].toLowerCase();
    return u.startsWith('dia') ? 'dias' : u.startsWith('ano') ? 'anos' : u.startsWith('hora') ? 'horas' : 'meses';
  }
  function numberSpots(text) {
    const out = []; let m;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(text))) {
      const unit = unitAfter(text, m.index + m[0].length);
      if (!unit) continue;
      const value = m[1] ? +m[1] : WORDNUM[m[3].toLowerCase().replace(/\s+/g, ' ')];
      if (!value || value < 2 || value > 400) continue;            // "um ano": troca denunciaria pelo singular
      if (/^\s*(?:\([^)]*\)\s*)?(dia|ano|m[eê]s|hora)(?!s)/iu.test(text.slice(m.index + m[0].length, m.index + m[0].length + 30))) continue;
      out.push({ start: m.index, end: m.index + m[0].length, value, unit, style: m[1] ? (m[2] ? 'both' : 'digits') : 'words', fem: unit === 'horas' });
    }
    return out;
  }
  function formatNum(n, spot, cap) {
    const w = extenso(n, spot.fem);
    let s = spot.style === 'both' ? `${n} (${w})` : spot.style === 'digits' ? String(n) : w;
    if (cap) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }
  function numberDistractors(r, spot, k) {
    const pool = (POOL[spot.unit] || POOL.anos).filter(n => n !== spot.value);
    const near = pool.sort((a, b) => Math.abs(a - spot.value) - Math.abs(b - spot.value)).slice(0, 6);
    return shuffle(r, near).slice(0, k);
  }

  /* ---------- pares de termos que as provas costumam trocar ---------- */
  const PAIRS = [
    ['absolutamente', 'relativamente'], ['absoluta', 'relativa'], ['absoluto', 'relativo'],
    ['nulo', 'anulável'], ['nula', 'anulável'], ['nulos', 'anuláveis'], ['nulas', 'anuláveis'],
    ['poderá', 'deverá'], ['pode', 'deve'], ['podem', 'devem'],
    ['maior', 'menor'], ['maiores', 'menores'], ['mínimo', 'máximo'], ['mínima', 'máxima'],
    ['anterior', 'posterior'], ['expressa', 'tácita'], ['expresso', 'tácito'],
    ['gratuito', 'oneroso'], ['gratuita', 'onerosa'], ['móveis', 'imóveis'], ['móvel', 'imóvel'],
    ['direta', 'indireta'], ['direto', 'indireto'], ['obrigatório', 'facultativo'], ['obrigatória', 'facultativa'],
    ['vedado', 'permitido'], ['vedada', 'permitida'], ['dolo', 'culpa'], ['dolosa', 'culposa'], ['doloso', 'culposo'],
    ['reclusão', 'detenção'], ['natos', 'naturalizados'], ['nato', 'naturalizado'],
    ['ascendentes', 'descendentes'], ['ascendente', 'descendente'], ['credor', 'devedor'],
    ['comprador', 'vendedor'], ['locador', 'locatário'], ['doador', 'donatário'], ['mandante', 'mandatário'],
    ['aumentada', 'diminuída'], ['aumenta-se', 'diminui-se'], ['um terço', 'metade'], ['dois terços', 'metade'],
    ['Senado Federal', 'Câmara dos Deputados'], ['Supremo Tribunal Federal', 'Superior Tribunal de Justiça'],
    ['pública', 'privada'], ['público', 'privado'], ['ativa', 'passiva'], ['ativo', 'passivo'],
    ['interrompe', 'suspende'], ['decadência', 'prescrição'], ['retroagirá', 'não retroagirá'],
    ['solidária', 'subsidiária'], ['solidariamente', 'subsidiariamente'], ['principal', 'acessório'],
    ['fungíveis', 'infungíveis'], ['consumíveis', 'inconsumíveis'], ['divisíveis', 'indivisíveis']
  ];
  // Termos "fracos" quase nunca são o ponto do artigo; só são usados se não houver nada melhor.
  const WEAK = new Set(['pode', 'deve', 'podem', 'devem', 'poderá', 'deverá', 'maior', 'menor', 'maiores', 'menores', 'anterior', 'posterior',
    'pública', 'privada', 'público', 'privado', 'ativa', 'passiva', 'ativo', 'passivo', 'direta', 'indireta', 'direto', 'indireto',
    'principal', 'acessório', 'credor', 'devedor', 'mínimo', 'máximo', 'mínima', 'máxima', 'metade']);
  const MODAL = new Set(['pode', 'deve', 'podem', 'devem', 'poderá', 'deverá']);
  const SWAP = new Map();
  PAIRS.forEach(([a, b]) => { if (!SWAP.has(a)) SWAP.set(a, b); if (!SWAP.has(b)) SWAP.set(b, a); });
  const TERM_RE = new RegExp(`(?<!${L}|-)(${[...SWAP.keys()].sort((a, b) => b.length - a.length).map(t => t.replace(/ /g, '\\s+')).join('|')})(?!${L}|-)`, 'gu');
  function termSpots(text) {
    const out = []; let m; TERM_RE.lastIndex = 0;
    while ((m = TERM_RE.exec(text))) {
      const t = m[1].replace(/\s+/g, ' ');
      const other = SWAP.get(t);
      // "pode/deve" só antes de um verbo no infinitivo ("pode ser", "deverá comunicar")
      const prev = text.slice(Math.max(0, m.index - 25), m.index).toLowerCase();
      if (/^(anterior|posterior)$/.test(t) && /(artigo|título|capítulo|seção|parágrafo|inciso|item|alínea|livro)\s+$/u.test(prev)) continue;
      if (/^(pública|público|privada|privado)$/i.test(t) && /(serviço|servidor|servidores|registro|ministério|interesse|poder|ordem|agente|cargo|emprego|funções|função|órgão|administração|autoridade|despesa|força|segurança|saúde|ensino|caráter)\s+$/u.test(prev)) continue;
      if (MODAL.has(t) && !/^\s+(?:\w+\s+)?[a-zà-ú]+[aei]r(?:-se)?\b/iu.test(text.slice(m.index + m[1].length, m.index + m[1].length + 30))) continue;
      // se o par aparece no mesmo trecho ("móveis ... imóveis"), a resposta fica óbvia
      if (new RegExp(`(?<!${L})${other.replace(/ /g, '\\s+')}(?!${L})`, 'iu').test(text)) continue;
      out.push({ start: m.index, end: m.index + m[1].length, term: t, other, weak: WEAK.has(t) });
    }
    return out;
  }
  const TERM_POOL = [...new Set(PAIRS.flat())];

  /* ---------- artigos muito conhecidos (para "qual é o artigo?") ---------- */
  const FAMOSOS = {
    cf: ['1º', '3º', '5º', '6º', '37', '60', '102', '105', '144', '196', '205', '225'],
    lindb: ['1º', '2º', '3º', '4º', '5º', '6º'],
    cc: ['1º', '2º', '3º', '4º', '5º', '6º', '11', '40', '82', '104', '138', '166', '171', '186', '187', '189', '205', '206', '927', '1.723'],
    cp: ['1º', '2º', '13', '14', '18', '20', '21', '23', '24', '25', '26', '121', '129', '155', '157', '171', '312', '317', '333'],
    cdc: ['2º', '3º', '6º', '12', '14', '18', '26', '49'],
    cpc: ['1º', '6º', '10', '300', '319', '1.009'],
    cpp: ['155', '157', '312', '387'],
    eca: ['2º', '4º'],
    clt: ['2º', '3º'],
    ctn: ['3º', '16']
  };
  const isFamous = (c, n) => (FAMOSOS[c] || []).includes(n);

  /* ---------- trecho de contexto ---------- */
  function clip(s, max) { if (s.length <= max) return s; const cut = s.lastIndexOf(' ', max); return s.slice(0, cut > 40 ? cut : max) + '…'; }
  function windowAround(text, start, end, max) {
    if (text.length <= max) return { pre: '', text, offset: 0, post: '' };
    let a = Math.max(0, start - Math.floor((max - (end - start)) / 2));
    let b = Math.min(text.length, a + max);
    a = Math.max(0, b - max);
    if (a > 0) { const sp = text.indexOf(' ', a); if (sp > 0 && sp < start) a = sp + 1; }
    if (b < text.length) { const sp = text.lastIndexOf(' ', b); if (sp > end) b = sp; }
    return { pre: a > 0 ? '…' : '', text: text.slice(a, b), offset: a, post: b < text.length ? '…' : '' };
  }

  /* ---------- montagem das perguntas ----------
     item: { id, c (código), n (número do artigo), label ("Art. 3º"), blocks: [texto do caput, incisos, parágrafos...] }
     Devolve uma lista de perguntas; cada uma é um objeto simples que pode ser salvo no aparelho. */
  // Notas de redação ("Redação dada pela Lei…", "Vide…", "DOU de…") não são texto da norma.
  const NOTE_RE = /\s*\((?=[^()]*(?:Redação|Incluíd|Acrescid|Revogad|Renumerad|Vide|DOU|Lei nº|Emenda Constitucional|Vigência|Regulamento|Vetad|ADI|ADC|ADPF))[^()]*\)/g;
  const cleanNotes = s => s.replace(NOTE_RE, '').replace(/\s{2,}/g, ' ').trim();
  function gerar(item, opts) {
    const r = rng((opts && opts.seed || '') + item.id);
    const caput = item.blocks[0] || '';
    const cands = [];
    item.blocks.map(cleanNotes).forEach((block, bi) => {
      if (block.length < 25) return;
      // incisos e alíneas sozinhos não se entendem: mostra o começo do caput antes
      const ctx = bi > 0 && /^([IVXLC]+\s*[-–—]|[a-z]\))/.test(block) ? clip(cleanNotes(caput), 140) : '';
      numberSpots(block).forEach(sp => cands.push({ kind: 'num', block, bi, ctx, sp }));
      termSpots(block).forEach(sp => cands.push({ kind: 'term', block, bi, ctx, sp }));
    });
    const out = [];
    const used = new Set();
    const ordered = shuffle(r, cands.filter(c => !c.sp.weak)).concat(shuffle(r, cands.filter(c => c.sp.weak)));
    const hasStrong = ordered.length && !ordered[0].sp.weak;
    for (const cand of ordered) {
      if (hasStrong && cand.sp.weak) break;
      if (out.length >= (opts && opts.max || 2)) break;
      const key = cand.bi + ':' + cand.sp.start;
      if (used.has(cand.bi)) continue; // no máximo uma pergunta por bloco
      used.add(cand.bi); used.add(key);
      const w = windowAround(cand.block, cand.sp.start, cand.sp.end, 320);
      const s = cand.sp.start - w.offset, e = cand.sp.end - w.offset;
      const before = w.text.slice(0, s), after = w.text.slice(e), orig = w.text.slice(s, e);
      const cap = /^[A-ZÀ-Ý]/.test(orig);
      let right, wrongs;
      if (cand.kind === 'num') {
        right = orig;
        wrongs = numberDistractors(r, cand.sp, 3).map(n => formatNum(n, cand.sp, cap));
      } else {
        right = orig;
        const other = cap ? cand.sp.other.charAt(0).toUpperCase() + cand.sp.other.slice(1) : cand.sp.other;
        wrongs = [other];
      }
      const base = { id: `${item.id}|${cand.bi}|${cand.sp.start}`, art: item.id, c: item.c, label: item.label, ctx: cand.ctx, pre: w.pre, before, after, post: w.post, right };
      const asVF = cand.kind === 'term' ? r() < 0.6 : r() < 0.45;
      if (asVF) {
        const truth = r() < 0.5;
        out.push(Object.assign(base, { type: 'vf', shown: truth ? right : wrongs[0], truth }));
      } else {
        const options = shuffle(r, [right, ...wrongs.slice(0, 3)]);
        out.push(Object.assign(base, { type: 'lacuna', options }));
      }
    }
    if (isFamous(item.c, item.n) && cleanNotes(caput).length > 40 && (!opts || opts.famous !== false)) {
      const near = (opts && opts.neighbors || []).filter(x => x !== item.label);
      if (near.length >= 3) {
        out.push({ id: `${item.id}|artigo`, art: item.id, c: item.c, label: item.label, type: 'artigo', excerpt: clip(cleanNotes(caput), 220), right: item.label, options: shuffle(r, [item.label, ...shuffle(r, near).slice(0, 3)]) });
      }
    }
    return out;
  }

  const api = { gerar, extenso, numberSpots, termSpots, isFamous, FAMOSOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Perguntas = api;
})(typeof window !== 'undefined' ? window : globalThis);
