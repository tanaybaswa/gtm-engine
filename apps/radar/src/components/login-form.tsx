"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type FormState } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-medium text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-60"
    >
      {pending ? <LoaderCircle size={16} className="animate-spin" /> : null}
      {pending ? "Signing in" : "Sign in"}
      {pending ? null : <ArrowRight size={16} />}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-[13px] font-medium text-fg-2" htmlFor="password">
        Team password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        required
        autoComplete="current-password"
        className="h-10 w-full rounded-lg border border-line bg-panel-2 px-3 text-[14px] text-fg focus:border-accent/60 focus:outline-none"
      />
      {state?.error ? <p className="text-[13px] text-bad">{state.error}</p> : null}
      <Submit />
    </form>
  );
}
