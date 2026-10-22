import * as React from "react";

/**
 * "May the current user change things here?" as context, so a screen decides once and every card, row and
 * dialog below it reads the answer instead of receiving a `canManage` prop through each level.
 *
 * - The session layout provides the household-wide rule (`canManageHousehold(user.role)`).
 * - A screen that gets its own rule from its route (`canManage={canManageMoney(user.role)}`) wraps its
 *   content in `<CanManageProvider value={canManage}>`.
 * - A component calls `useCanManage(canManageProp)`: an explicit prop still wins (stories, a component
 *   embedded in another feature's page), else the nearest provider, else `false`.
 */
const CanManageContext = React.createContext<boolean | null>(null);

export function CanManageProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return React.createElement(CanManageContext.Provider, { value }, children);
}

export function useCanManage(explicit?: boolean): boolean {
  const provided = React.useContext(CanManageContext);
  return explicit ?? provided ?? false;
}
