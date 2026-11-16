// Guarda o KMZ já lido no IndexedDB deste navegador. Tudo em try/catch: se falhar, o site segue
// sem guardar e pede o KMZ de novo na próxima vez.
const BANCO = 'kit-ambiental';
const LOJA = 'base';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
    pedido.onblocked = () => reject(new Error('banco bloqueado'));
  });
}

function pedir<T>(modo: IDBTransactionMode, f: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(LOJA, modo);
        const r = f(t.objectStore(LOJA));
        t.oncomplete = () => { db.close(); resolve(r.result); };
        t.onerror = t.onabort = () => { db.close(); reject(t.error); };
      }),
  );
}

export async function guardar(chave: string, valor: unknown): Promise<void> {
  try {
    await pedir('readwrite', (l) => l.put(valor, chave));
  } catch {
    // segue sem guardar
  }
}

export async function ler(chave: string): Promise<unknown> {
  try {
    return await pedir('readonly', (l) => l.get(chave));
  } catch {
    return undefined;
  }
}
