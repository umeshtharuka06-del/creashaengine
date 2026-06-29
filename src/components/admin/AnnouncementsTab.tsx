"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

interface Ann {
  id: string;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
}

export function AnnouncementsTab() {
  const [items, setItems] = useState<Ann[]>([]);
  const [form, setForm] = useState({ title: "", body: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api<Ann[]>("/api/admin/announcements");
    if (res.ok) setItems(res.data || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.body) return;
    setBusy(true);
    await api("/api/admin/announcements", { json: form });
    setForm({ title: "", body: "" });
    setBusy(false);
    load();
  }

  async function remove(id: string) {
    await api("/api/admin/announcements", { method: "DELETE", json: { id } });
    load();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={create} className="glass space-y-3 p-5">
        <h3 className="text-sm font-semibold">New announcement</h3>
        <input
          className="input"
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <textarea
          className="input min-h-[100px]"
          placeholder="Message body…"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <button disabled={busy} className="btn-blue">
          {busy ? "Publishing…" : "Publish"}
        </button>
      </form>

      <div className="glass p-5">
        <h3 className="mb-3 text-sm font-semibold">Published</h3>
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="text-sm text-slate-500">No announcements yet.</div>
          )}
          {items.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-royal-yellow">{a.title}</div>
                <button
                  onClick={() => remove(a.id)}
                  className="chip bg-royal-red/15 text-red-300 hover:bg-royal-red/25"
                >
                  delete
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-300">{a.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
