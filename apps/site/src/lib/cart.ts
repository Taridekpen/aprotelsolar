export type CartKind = 'product' | 'package';

export type CartLine = {
  kind: CartKind;
  id: string;
  slug: string;
  name: string;
  unitPrice: string;
  quantity: number;
  imageId?: string;
};

const KEY = 'aprotel.cart';
const listeners = new Set<() => void>();
export const emptyLines: CartLine[] = [];
let lines: CartLine[] = read();

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartLine[];
    return Array.isArray(parsed) ? parsed.filter((line) => line?.id && line.quantity > 0) : emptyLines;
  } catch {
    return emptyLines;
  }
}

function commit(next: CartLine[]) {
  lines = next;
  localStorage.setItem(KEY, JSON.stringify(lines));
  listeners.forEach((listener) => listener());
}

export const cart = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return lines;
  },
  add(line: Omit<CartLine, 'quantity'> & { quantity?: number }) {
    const quantity = line.quantity ?? 1;
    const existing = lines.find((item) => item.kind === line.kind && item.id === line.id);
    if (existing) {
      commit(lines.map((item) => (item === existing ? { ...item, quantity: item.quantity + quantity, unitPrice: line.unitPrice } : item)));
      return;
    }
    commit([...lines, { ...line, quantity }]);
  },
  setQuantity(kind: CartKind, id: string, quantity: number) {
    if (quantity < 1) {
      commit(lines.filter((line) => !(line.kind === kind && line.id === id)));
      return;
    }
    commit(lines.map((line) => (line.kind === kind && line.id === id ? { ...line, quantity } : line)));
  },
  remove(kind: CartKind, id: string) {
    commit(lines.filter((line) => !(line.kind === kind && line.id === id)));
  },
  clear() {
    commit([]);
  },
};

const compareKey = 'aprotel.compare';
const emptyCompare: string[] = [];
export { emptyCompare };
let compared: string[] = readCompare();
const compareListeners = new Set<() => void>();

function readCompare() {
  try {
    const parsed = JSON.parse(localStorage.getItem(compareKey) ?? '[]') as string[];
    return Array.isArray(parsed) ? parsed.slice(0, 3) : emptyCompare;
  } catch {
    return emptyCompare;
  }
}

function commitCompare(next: string[]) {
  compared = next.slice(0, 3);
  localStorage.setItem(compareKey, JSON.stringify(compared));
  compareListeners.forEach((listener) => listener());
}

export const compareList = {
  subscribe(listener: () => void) {
    compareListeners.add(listener);
    return () => compareListeners.delete(listener);
  },
  getSnapshot() {
    return compared;
  },
  toggle(slug: string) {
    if (compared.includes(slug)) commitCompare(compared.filter((item) => item !== slug));
    else if (compared.length < 3) commitCompare([...compared, slug]);
  },
  remove(slug: string) {
    commitCompare(compared.filter((item) => item !== slug));
  },
};
