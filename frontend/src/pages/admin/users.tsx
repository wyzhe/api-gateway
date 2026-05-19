import { History, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { AdminUser, Transaction } from "@/lib/types";
import { fmtBalance, fmtCompactMoney, fmtDate, txnBadgeVariant, txnTypeKey } from "@/lib/utils";

export function AdminUsersPage() {
  const t = useT();
  const { user: me } = useAuth();
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [openRecharge, setOpenRecharge] = useState<AdminUser | null>(null);
  const [openEdit, setOpenEdit] = useState<AdminUser | null>(null);
  const [openTxns, setOpenTxns] = useState<AdminUser | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);

  // Create form
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [initBalance, setInitBalance] = useState("10");

  // Recharge form
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeNote, setRechargeNote] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin">("user");
  const [editPw, setEditPw] = useState("");

  const refresh = async () => {
    const data = await api<AdminUser[]>("/api/admin/users");
    setRows(data);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  useEffect(() => {
    if (!openTxns) {
      setTxns([]);
      return;
    }
    api<Transaction[]>(`/api/admin/users/${openTxns.id}/transactions`)
      .then(setTxns)
      .catch(() => {});
  }, [openTxns]);

  const create = async () => {
    if (!email || !pw) return;
    await api("/api/admin/users", {
      method: "POST",
      body: {
        email,
        password: pw,
        display_name: name || null,
        initial_balance: initBalance,
      },
    });
    toast.success(t("admin.users.toastCreated"));
    setOpenCreate(false);
    setEmail("");
    setPw("");
    setName("");
    setInitBalance("10");
    void refresh();
  };

  const recharge = async () => {
    if (!openRecharge || !rechargeAmount) return;
    await api(`/api/admin/users/${openRecharge.id}/recharge`, {
      method: "POST",
      body: { amount: rechargeAmount, note: rechargeNote || null },
    });
    toast.success(t("admin.users.toastBalanceUpdated"));
    setOpenRecharge(null);
    setRechargeAmount("");
    setRechargeNote("");
    void refresh();
  };

  const openEditDialog = (u: AdminUser) => {
    setOpenEdit(u);
    setEditName(u.display_name ?? "");
    setEditRole(u.role);
    setEditPw("");
  };

  const saveEdit = async () => {
    if (!openEdit) return;
    const body: Record<string, unknown> = {
      display_name: editName.trim() || null,
      role: editRole,
    };
    if (editPw.trim()) body.password = editPw.trim();
    await api(`/api/admin/users/${openEdit.id}`, { method: "PATCH", body });
    toast.success(t("admin.users.toastUserUpdated"));
    setOpenEdit(null);
    void refresh();
  };

  const toggle = async (u: AdminUser) => {
    const a = u.status === "active" ? "disable" : "enable";
    await api(`/api/admin/users/${u.id}/${a}`, { method: "POST" });
    toast.success(
      a === "disable"
        ? t("admin.users.toastUserDisabled")
        : t("admin.users.toastUserEnabled"),
    );
    void refresh();
  };

  const isEditingSelf = !!openEdit && openEdit.id === me?.id;

  return (
    <div>
      <PageHeader
        title={t("admin.users.title")}
        actions={
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="h-4 w-4" /> {t("admin.users.newUserBtn")}
          </Button>
        }
      />

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.users.colEmail")}</TableHead>
              <TableHead>{t("admin.users.colRole")}</TableHead>
              <TableHead>{t("admin.users.colStatus")}</TableHead>
              <TableHead>{t("admin.users.colBalance")}</TableHead>
              <TableHead>{t("admin.users.colCreated")}</TableHead>
              <TableHead className="text-right">{t("admin.users.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.email}</div>
                  {u.display_name && <div className="text-xs text-muted-foreground">{u.display_name}</div>}
                </TableCell>
                <TableCell><Badge variant={u.role === "admin" ? "accent" : "outline"}>{u.role}</Badge></TableCell>
                <TableCell>
                  <Badge variant={u.status === "active" ? "success" : "warn"}>
                    {u.status === "active"
                      ? t("common.status.active")
                      : t("common.status.disabled")}
                  </Badge>
                </TableCell>
                <TableCell className="mono text-xs">{fmtBalance(u.balance)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(u.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(u)} title={t("admin.users.actionEdit")}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setOpenTxns(u)} title={t("admin.users.actionTransactions")}>
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setOpenRecharge(u)}>
                      {t("admin.users.actionRecharge")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggle(u)}
                      disabled={u.id === me?.id}
                      title={u.id === me?.id ? t("admin.users.selfActionBlocked") : undefined}
                    >
                      {u.status === "active"
                        ? t("admin.users.actionDisable")
                        : t("admin.users.actionEnable")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("admin.users.createDialog.title")}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label={t("admin.users.createDialog.emailLabel")}>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField label={t("admin.users.createDialog.passwordLabel")}>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </FormField>
            <FormField label={t("admin.users.createDialog.nameLabel")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label={t("admin.users.createDialog.initialBalanceLabel")}>
              <Input value={initBalance} onChange={(e) => setInitBalance(e.target.value)} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setOpenCreate(false)}>
              {t("admin.users.createDialog.cancel")}
            </Button>
            <Button onClick={create}>{t("admin.users.createDialog.submit")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!openEdit} onOpenChange={(o) => !o && setOpenEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("admin.users.editDialog.title", { email: openEdit?.email ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label={t("admin.users.editDialog.nameLabel")}>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </FormField>
            <FormField label={t("admin.users.editDialog.roleLabel")}>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as "user" | "admin")}
                disabled={isEditingSelf}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("admin.users.editDialog.roleUser")}</SelectItem>
                  <SelectItem value="admin">{t("admin.users.editDialog.roleAdmin")}</SelectItem>
                </SelectContent>
              </Select>
              {isEditingSelf && (
                <div className="text-xs text-muted-foreground mt-1">
                  {t("admin.users.selfRoleLocked")}
                </div>
              )}
            </FormField>
            <FormField label={t("admin.users.editDialog.resetPasswordLabel")}>
              <Input
                type="password"
                value={editPw}
                onChange={(e) => setEditPw(e.target.value)}
                placeholder={t("admin.users.editDialog.resetPasswordPlaceholder")}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setOpenEdit(null)}>
              {t("admin.users.editDialog.cancel")}
            </Button>
            <Button onClick={saveEdit}>{t("admin.users.editDialog.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recharge */}
      <Dialog open={!!openRecharge} onOpenChange={(o) => !o && setOpenRecharge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("admin.users.rechargeDialog.title", { email: openRecharge?.email ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label={t("admin.users.rechargeDialog.amountLabel")}>
              <Input
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                placeholder={t("admin.users.rechargeDialog.amountPlaceholder")}
              />
            </FormField>
            <FormField label={t("admin.users.rechargeDialog.noteLabel")}>
              <Input value={rechargeNote} onChange={(e) => setRechargeNote(e.target.value)} />
            </FormField>
            <div className="text-xs text-muted-foreground">
              {t("admin.users.rechargeDialog.auditHint")}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setOpenRecharge(null)}>
              {t("admin.users.rechargeDialog.cancel")}
            </Button>
            <Button onClick={recharge}>{t("admin.users.rechargeDialog.submit")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transactions drawer */}
      <Sheet open={!!openTxns} onOpenChange={(o) => !o && setOpenTxns(null)}>
        <SheetContent>
          {openTxns && (
            <>
              <SheetHeader>
                <SheetTitle>{openTxns.email}</SheetTitle>
                <SheetDescription>
                  {t("admin.users.txnsDrawer.currentBalance")}{" "}
                  <span className="mono text-foreground">{fmtBalance(openTxns.balance)}</span>
                  {" · "}
                  {t("admin.users.txnsDrawer.txnsCount", { count: txns.length })}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                {txns.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-6">
                    {t("admin.users.txnsDrawer.empty")}
                  </div>
                )}
                {txns.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.users.txnsDrawer.colType")}</TableHead>
                        <TableHead>{t("admin.users.txnsDrawer.colAmount")}</TableHead>
                        <TableHead>{t("admin.users.txnsDrawer.colBalanceAfter")}</TableHead>
                        <TableHead>{t("admin.users.txnsDrawer.colNote")}</TableHead>
                        <TableHead>{t("admin.users.txnsDrawer.colWhen")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txns.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>
                            <Badge variant={txnBadgeVariant(tx.type)}>
                              {t(txnTypeKey(tx.type))}
                            </Badge>
                          </TableCell>
                          <TableCell className="mono text-xs">
                            {tx.type === "debit" ? "−" : "+"}
                            {fmtCompactMoney(tx.amount)}
                          </TableCell>
                          <TableCell className="mono text-xs">{fmtBalance(tx.balance_after)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{tx.note || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(tx.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
