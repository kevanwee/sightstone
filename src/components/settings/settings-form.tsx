"use client";

import { useState } from "react";
import { Building2, User, Users, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Member = {
  id: string; role: string;
  user: { id: string; name: string | null; email: string };
};

type Organisation = {
  id: string; name: string; slug: string;
  members: Member[];
};

interface Props {
  user: { id: string; name?: string | null; email?: string | null };
  organisation: Organisation;
  role: string;
}

export function SettingsForm({ user, organisation, role }: Props) {
  const [orgName, setOrgName] = useState(organisation.name);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/organisation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const canEditOrg = ["OWNER", "ADMIN"].includes(role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">Manage your profile and organisation</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>Your profile</CardTitle>
              <CardDescription>Your personal account details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <p className="mt-1 text-sm text-slate-700">{user.name ?? "—"}</p>
            </div>
            <div>
              <Label>Email</Label>
              <p className="mt-1 text-sm text-slate-700">{user.email}</p>
            </div>
            <div>
              <Label>Role in organisation</Label>
              <Badge className="mt-1" variant="secondary">{role.toLowerCase()}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organisation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>Organisation</CardTitle>
              <CardDescription>Your organisation&apos;s details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveOrg} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organisation name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={!canEditOrg}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug (URL identifier)</Label>
                <Input value={organisation.slug} disabled className="bg-slate-50" />
              </div>
            </div>
            {canEditOrg && (
              <Button
                type="submit"
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={saving}
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4" />
                    Saved!
                  </>
                ) : saving ? "Saving…" : "Save changes"}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>Team members</CardTitle>
              <CardDescription>
                {organisation.members.length} member{organisation.members.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {organisation.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                  {m.user.name?.charAt(0).toUpperCase() ?? m.user.email.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">
                    {m.user.name ?? m.user.email}
                    {m.user.id === user.id && (
                      <span className="ml-1 text-xs text-slate-400">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{m.user.email}</p>
                </div>
                <Badge variant="secondary" className="text-xs capitalize">
                  {m.role.toLowerCase()}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
