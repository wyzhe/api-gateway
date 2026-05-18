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
import type { AdminUser, Transaction } from "@/lib/types";
import { fmtCompactMoney, fmtDate } from "@/lib/utils";

export function AdminUsersPage() {
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
    toast.success("User created");
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
    toast.success("Balance updated");
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
    toast.success("User updated");
    setOpenEdit(null);
    void refresh();
  };

  const toggle = async (u: AdminUser) => {
    const a = u.status === "active" ? "disable" : "enable";
    await api(`/api/admin/users/${u.id}/${a}`, { method: "POST" });
    toast.success(`User ${a}d`);
    void refresh();
  };

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${rows.length} accounts`}
        actions={<Button onClick={() => setOpenCreate(true)}><Plus className="h-4 w-4" /> New user</Button>}
      />

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                <TableCell><Badge variant={u.status === "active" ? "success" : "warn"}>{u.status}</Badge></TableCell>
                <TableCell className="mono text-xs">{fmtCompactMoney(u.balance)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(u.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(u)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setOpenTxns(u)} title="Transactions">
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setOpenRecharge(u)}>Recharge</Button>
                    <Button variant="outline" size="sm" onClick={() => toggle(u)}>
                      {u.status === "active" ? "Disable" : "Enable"}
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
          <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
            <FormField label="Password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></FormField>
            <FormField label="Display name (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
            <FormField label="Initial balance (USD)"><Input value={initBalance} onChange={(e) => setInitBalance(e.target.value)} /></FormField>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
            <Button onClick={create}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!openEdit} onOpenChange={(o) => !o && setOpenEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {openEdit?.email}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label="Display name">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </FormField>
            <FormField label="Role">
              <Select value={editRole} onValueChange={(v) => setEditRole(v as "user" | "admin")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Reset password (leave blank to keep current)">
              <Input
                type="password"
                value={editPw}
                onChange={(e) => setEditPw(e.target.value)}
                placeholder="min 6 chars"
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setOpenEdit(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recharge */}
      <Dialog open={!!openRecharge} onOpenChange={(o) => !o && setOpenRecharge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recharge {openRecharge?.email}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label="Amount (USD, can be decimal)">
              <Input value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} placeholder="10" />
            </FormField>
            <FormField label="Note (optional)">
              <Input value={rechargeNote} onChange={(e) => setRechargeNote(e.target.value)} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setOpenRecharge(null)}>Cancel</Button>
            <Button onClick={recharge}>Recharge</Button>
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
                  Current balance <span className="mono text-foreground">{fmtCompactMoney(openTxns.balance)}</span>
                  {" · "}{txns.length} transactions
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                {txns.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-6">No transactions yet.</div>
                )}
                {txns.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Balance after</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txns.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <Badge variant={t.type === "recharge" ? "success" : t.type === "debit" ? "warn" : "default"}>
                              {t.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="mono text-xs">
                            {t.type === "debit" ? "−" : "+"}
                            {fmtCompactMoney(t.amount)}
                          </TableCell>
                          <TableCell className="mono text-xs">{fmtCompactMoney(t.balance_after)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.note || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(t.created_at)}</TableCell>
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
