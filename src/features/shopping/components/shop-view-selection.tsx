import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import * as React from "react";
import { LayersIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EntityMultiPicker } from "@/components/shared/entity-multi-picker";
import { ApiRequestError } from "@/lib/api-client";
import { createShopGroup, updateShopGroup, deleteShopGroup, type SavedShopGroup, type Shop } from "@/features/shops";
import { NO_SHOP } from "../types/shopping";

type Props = {
  shops: Shop[];
  groups: SavedShopGroup[];
  selectedKeys: string[];
  activeGroupId?: string;
  canManage: boolean;
  onSelect: (keys: string[]) => void;
  onSelectGroup: (id: string) => void;
  onSaved: () => Promise<void>;
  compact?: boolean;
};

/** Ad-hoc shop combinations and household-wide saved groups use the same selection. */
export function ShopViewSelection({ shops, groups, selectedKeys, activeGroupId, canManage, onSelect, onSelectGroup, onSaved, compact = false }: Props) {
  const { t } = useTranslation("shopping");
  const { t: common } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<SavedShopGroup | null>(null);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const groupNameId = React.useId();

  function choose(group?: SavedShopGroup) {
    setEditing(group ?? null);
    setDraft(group?.shopIds ?? selectedKeys);
    setName(group?.name ?? "");

    setOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      const input = { name: name.trim(), shopIds: draft.filter((id) => id !== NO_SHOP) };
      const group = editing ? await updateShopGroup(editing.id, input) : await createShopGroup(input);
      await onSaved();
      onSelectGroup(group.id);
      setOpen(false);
    } catch (error) {
      toast.error(t(error instanceof ApiRequestError && error.status === 409 ? "shopGroups.duplicateName" : "errors.generic"));
    } finally { setBusy(false); }
  }

  const options = [...shops.map((shop) => ({ id: shop.id, name: shop.name })), { id: NO_SHOP, name: t("shops.noShop") }];
  return (
    <div className={compact ? "min-w-0" : "flex flex-col gap-3 rounded-xl border bg-card p-4"}>
      {compact ? <Button variant="outline" size="sm" onClick={() => choose()}><LayersIcon />{t("shopGroups.choose")}</Button> : <>
      <Inline gap="sm" align="center" justify="between" wrap>
        <span className="text-sm font-medium">{t("shopGroups.title")}</span>
        <Button variant="outline" size="sm" onClick={() => choose()}><PlusIcon />{t("shopGroups.combine")}</Button>
      </Inline>
      <Text size="sm" tone="muted">{t("shopGroups.description")}</Text>
      {groups.length > 0 && <Inline gap="sm" align="stretch" wrap>
        {groups.map((group) => <Inline gap="xs" align="center" key={group.id} className="min-w-0 max-w-full rounded-lg border p-1">
          <Button className="min-w-0" size="sm" variant={activeGroupId === group.id ? "secondary" : "ghost"} onClick={() => onSelectGroup(group.id)} aria-pressed={activeGroupId === group.id} title={group.name}>
            <LayersIcon /><span className="truncate">{group.name}</span>
          </Button>
          {canManage && <>
            <Button variant="ghost" size="icon-sm" aria-label={t("shopGroups.edit", { name: group.name })} onClick={() => choose(group)}><PencilIcon /></Button>
            <ConfirmDialog
              trigger={<Button variant="ghost" size="icon-sm" aria-label={t("shopGroups.remove", { name: group.name })}><Trash2Icon /></Button>}
              title={t("shopGroups.remove", { name: group.name })} description={t("shopGroups.removeDescription")}
              confirmLabel={common("actions.delete")} cancelLabel={common("actions.cancel")} destructive
              onConfirm={async () => {
                try {
                  await deleteShopGroup(group.id);
                  if (activeGroupId === group.id) onSelect(selectedKeys);
                  await onSaved();
                } catch { toast.error(t("errors.generic")); }
              }}
            />
          </>}
        </Inline>)}
      </Inline>}
      </>}
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          {compact && groups.length > 0 && <Inline gap="sm" align="stretch" wrap className="pr-6">{groups.map((group) => <Button key={group.id} variant="outline" size="sm" onClick={() => { onSelectGroup(group.id); setOpen(false); }}>{group.name}</Button>)}</Inline>}
          <DialogHeader><DialogTitle>{editing ? t("shopGroups.edit", { name: editing.name }) : t("shopGroups.combine")}</DialogTitle><DialogDescription>{t("shopGroups.description")}</DialogDescription></DialogHeader>
          <EntityMultiPicker items={options.filter((shop) => !editing || shop.id !== NO_SHOP).map((shop) => ({ id: shop.id, label: shop.name }))}
            value={draft} onChange={setDraft} disabled={busy} placeholder={t("shopGroups.search")} />
          {canManage && <Stack gap="sm" className="border-t pt-4">
            <label htmlFor={groupNameId} className="text-sm font-medium">{t("shopGroups.name")}</label>
            <Input id={groupNameId} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder={t("shopGroups.namePlaceholder")} disabled={busy} />
            <Text size="xs" tone="muted">{t("shopGroups.saveHint")}</Text>
          </Stack>}
          <Inline gap="sm" align="stretch" justify="end" wrap>
            <Button variant="outline" disabled={busy || draft.length === 0} onClick={() => { onSelect(draft); setOpen(false); }}>{t("shopGroups.apply")}</Button>
            {canManage && <Button disabled={busy || !name.trim() || draft.length < 2 || draft.includes(NO_SHOP)} onClick={() => void save()}>{busy ? common("form.saving") : t(editing ? "shopGroups.save" : "shopGroups.saveNew")}</Button>}
          </Inline>
        </DialogContent>
      </Dialog>
    </div>
  );
}
