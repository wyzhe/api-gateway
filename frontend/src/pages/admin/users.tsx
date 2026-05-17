import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { fmtCompactMoney, fmtDate } from "@/lib/utils";

type User = {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
  balance: string;
  created_at: string;
};

export function AdminUsersPage() {
  const [rows, setRows] = useState<User[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [openRecharge, setOpenRecharge] = useState<User | null>(null);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [initBalance, setInitBalance] = useState("10");

  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeNote, setRechargeNote] = useState("");

  const refresh = async () => {
    const data = await api<User[]>("/api/admin/users");
    setRows(data);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

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

  const toggle = async (u: User) => {
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
            <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Display name (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Initial balance (USD)"><Input value={initBalance} onChange={(e) => setInitBalance(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
            <Button onClick={create}>Create</Button>
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
            <Field label="Amount (USD, can be decimal)">
              <Input value={rechargeAmount} onChange={(e) => setRechargeAmount(e.target.value)} placeholder="10" />
            </Field>
            <Field label="Note (optional)">
              <Input value={rechargeNote} onChange={(e) => setRechargeNote(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setOpenRecharge(null)}>Cancel</Button>
            <Button onClick={recharge}>Recharge</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
