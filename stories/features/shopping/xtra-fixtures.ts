import type { XtraListInitial } from "@/features/shopping/data/use-xtra-list";
export const disconnectedXtra = { status: { configured: true, connected: false, canUse: false, canManage: false, needsReconnect: false, connectedAt: null, checkedAt: null, placeId: null, members: [] } } satisfies XtraListInitial;
export const connectedXtra = {
  status: { ...disconnectedXtra.status, connected: true, canUse: true, canManage: true, placeId: "1234" },
  snapshot: { placeId: "1234", observedAt: "2026-11-12T12:00:00Z", truncated: false, items: [
    { id: "xt-list-milk", name: "BONI Melk halfvol 1 l", productId: "123456", quantity: 2, unit: "P", completed: false },
    { id: "xt-list-apples", name: "Appelen Jonagold", productId: "654321", quantity: 1, unit: "P", completed: false },
    { id: "xt-list-coffee", name: "Gemalen koffie", productId: "654322", quantity: 1, unit: "P", completed: true },
  ] },
} satisfies XtraListInitial;
