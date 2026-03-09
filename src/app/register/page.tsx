"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    orgName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        return;
      }

      // Auto sign-in after registration
      const { signIn } = await import("next-auth/react");
      await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-blue-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-white">Sightstone</span>
        </div>

        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="text-white">Create your account</CardTitle>
            <CardDescription className="text-slate-400">
              Register and set up your organisation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Your name</Label>
                <Input
                  name="name"
                  placeholder="Jane Smith"
                  value={form.name}
                  onChange={handleChange}
                  required
                  className="border-white/20 bg-white/10 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Organisation name</Label>
                <Input
                  name="orgName"
                  placeholder="Acme Legal Ltd"
                  value={form.orgName}
                  onChange={handleChange}
                  required
                  className="border-white/20 bg-white/10 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Email address</Label>
                <Input
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={handleChange}
                  required
                  className="border-white/20 bg-white/10 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Password</Label>
                <Input
                  name="password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                  className="border-white/20 bg-white/10 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  "Create account & organisation"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-slate-400">
              Already have an account?{" "}
              <Link href="/login" className="text-blue-400 hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
