"use client";

import { useActionState } from "react";
import { login, saveTopic, type FormState } from "@/app/actions";
import { SubmitButton } from "./client";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium" htmlFor="password">
        Team password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        required
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {state?.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      <SubmitButton pendingText="Signing in...">Sign in</SubmitButton>
    </form>
  );
}

export function TopicForm({ id, name, description, config }: { id: number; name: string; description: string; config: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveTopic, undefined);
  const field = "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="name">
          Name
        </label>
        <input id="name" name="name" defaultValue={name} className={field} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="description">
          Description
        </label>
        <p className="mb-1 text-xs text-zinc-500">Claude reads this to judge relevance, so describe what matters and what doesn&apos;t.</p>
        <textarea id="description" name="description" defaultValue={description} rows={4} className={field} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="config">
          Searches, feeds and filters (JSON)
        </label>
        <p className="mb-1 text-xs text-zinc-500">
          Keyword groups filter general feeds (every group needs a match; a trailing * matches prefixes). Queries run per source. Feeds
          with &quot;filter&quot;: false keep every item.
        </p>
        <textarea id="config" name="config" defaultValue={config} rows={24} spellCheck={false} className={`${field} font-mono text-xs`} />
      </div>
      {state?.error ? <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.ok}</p> : null}
      <SubmitButton pendingText="Saving...">Save topic</SubmitButton>
    </form>
  );
}
