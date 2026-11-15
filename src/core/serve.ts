/**
 * Serve rotation. Order is: server, first opponent, server's partner, second opponent.
 * The slot comes from the score (see serveSlot); setting a server mid-match rebuilds the
 * order from that player and anchors it at the current slot.
 */
export interface ServeOrder {
  order: string[];
  /** Slot at which order[0] serves. */
  base: number;
}

export function buildOrder(server: string, sideA: string[], sideB: string[], previous?: string[]): string[] {
  const own = sideA.includes(server) ? sideA : sideB;
  let opp = own === sideA ? [...sideB] : [...sideA];
  if (previous) {
    // Keep the opponents in the order they already had.
    opp = [...opp].sort((x, y) => previous.indexOf(x) - previous.indexOf(y));
  }
  const partner = own.find((p) => p !== server);
  const order = [server];
  if (opp[0]) order.push(opp[0]);
  if (partner) order.push(partner);
  if (opp[1]) order.push(opp[1]);
  return order;
}

export function setServer(current: ServeOrder | null, server: string, slot: number, sideA: string[], sideB: string[]): ServeOrder {
  return { order: buildOrder(server, sideA, sideB, current?.order), base: slot };
}

export function currentServer(serve: ServeOrder | null, slot: number): string | null {
  if (!serve || serve.order.length === 0) return null;
  const n = serve.order.length;
  const i = (((slot - serve.base) % n) + n) % n;
  return serve.order[i] ?? null;
}
