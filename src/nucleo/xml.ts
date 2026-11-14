export interface OuvinteXml {
  abre(nome: string, attrs: Record<string, string>): void;
  fecha(nome: string): void;
  texto(t: string): void;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodificar(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (todo, e: string) => {
    if (e[0] === '#') {
      const cod = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cod); } catch { return todo; }
    }
    return ENTIDADES[e] ?? todo;
  });
}

const semPrefixo = (nome: string): string => {
  const i = nome.indexOf(':');
  return i < 0 ? nome : nome.slice(i + 1);
};

const RE_ATTR = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function lerAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!s.includes('=')) return attrs;
  RE_ATTR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_ATTR.exec(s))) attrs[semPrefixo(m[1])] = decodificar(m[2] ?? m[3] ?? '');
  return attrs;
}

/** Percorre o XML de ponta a ponta sem DOM e sem guardar a árvore. Texto só de espaços é ignorado. */
export function percorrerXml(texto: string, ao: OuvinteXml): void {
  const n = texto.length;
  let i = 0;
  while (i < n) {
    const lt = texto.indexOf('<', i);
    const fim = lt < 0 ? n : lt;
    if (fim > i) {
      const t = texto.slice(i, fim);
      if (t.trim() !== '') ao.texto(decodificar(t));
    }
    if (lt < 0) return;
    if (texto.startsWith('<!--', lt)) {
      const f = texto.indexOf('-->', lt + 4);
      i = f < 0 ? n : f + 3;
    } else if (texto.startsWith('<![CDATA[', lt)) {
      const f = texto.indexOf(']]>', lt + 9);
      const t = texto.slice(lt + 9, f < 0 ? n : f);
      if (t.trim() !== '') ao.texto(t);
      i = f < 0 ? n : f + 3;
    } else if (texto[lt + 1] === '?' || texto[lt + 1] === '!') {
      const f = texto.indexOf('>', lt + 2);
      i = f < 0 ? n : f + 1;
    } else {
      // fim da etiqueta: o primeiro ">" fora de aspas
      let f = lt + 1;
      let aspas = '';
      while (f < n) {
        const c = texto[f];
        if (aspas) { if (c === aspas) aspas = ''; } else if (c === '"' || c === "'") aspas = c; else if (c === '>') break;
        f++;
      }
      const miolo = texto.slice(lt + 1, f);
      i = f + 1;
      if (miolo[0] === '/') {
        ao.fecha(semPrefixo(miolo.slice(1).trim()));
        continue;
      }
      const autoFecha = miolo.endsWith('/');
      const corpo = autoFecha ? miolo.slice(0, -1) : miolo;
      const esp = corpo.search(/\s/);
      const nome = semPrefixo(esp < 0 ? corpo : corpo.slice(0, esp));
      ao.abre(nome, esp < 0 ? {} : lerAttrs(corpo.slice(esp)));
      if (autoFecha) ao.fecha(nome);
    }
  }
}
