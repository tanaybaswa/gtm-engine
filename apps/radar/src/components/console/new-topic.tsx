"use client";

import { Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useConsole, useCtl, useStore } from "./store";
import { Button } from "./ui";

const STEPS = [
  "Reading your brief",
  "Designing news, Reddit and social searches",
  "Choosing feeds, filters and a watchlist",
  "Checking each feed is live",
  "Starting the first run",
];

const EXAMPLES = [
  { name: "Cyber insurance for SMBs", brief: "Cyber insurance for small and mid-sized businesses in the US: new products, pricing, claims trends, MGAs and insurtechs, and the brokers selling it." },
  { name: "AI agents in banking", brief: "Banks and fintechs deploying AI agents: launches, pilots, regulation, vendor deals, and the executives leading them." },
  { name: "Parametric insurance", brief: "Parametric and index-based insurance for climate and weather risk: new programs, capacity, reinsurance deals, and public-sector buyers." },
];

export function NewTopicDialog() {
  const open = useConsole((s) => s.newTopic);
  if (!open) return null;
  return <Dialog />;
}

function Dialog() {
  const store = useStore();
  const ctl = useCtl();
  const aiOn = useConsole((s) => s.payloads[s.topicId]?.spend.ai.enabled ?? true);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const close = () => !busy && store.set({ newTopic: false });

  // Claude's design takes 20 to 60 seconds; walk through the steps while it works.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setStep((s) => Math.min(STEPS.length - 2, s + 1)), 9000);
    return () => clearInterval(id);
  }, [busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const submit = async () => {
    if (!name.trim()) {
      setError("Give the topic a name.");
      return;
    }
    setBusy(true);
    setStep(0);
    setError(null);
    const result = await ctl.newTopic({ name, brief });
    if (result.error) {
      setError(result.error);
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border border-line bg-panel-2 px-3 text-[14px] text-fg placeholder:text-fg-3 focus:border-accent/60 focus:outline-none";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-[8vh] backdrop-blur-[2px]" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="New topic"
        className="animate-rise w-full max-w-[560px] rounded-2xl border border-line-2 bg-panel shadow-[var(--shadow)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <div className="flex items-center gap-2 text-[16px] font-semibold">
              <Sparkles size={16} className="text-accent" /> New topic
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
              {aiOn
                ? "Describe what to track in plain words. Claude designs the searches, feeds, filters and watchlist, then the first run starts."
                : "Claude is off, so the topic starts with a simple search for its name. You can add searches and feeds in Settings."}
            </p>
          </div>
          <button type="button" onClick={close} disabled={busy} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-panel-2 hover:text-fg disabled:opacity-40" aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {busy ? (
          <ol className="space-y-2.5 px-5 py-6">
            {STEPS.map((label, i) => (
              <li key={label} className={`flex items-center gap-3 text-[13.5px] ${i < step ? "text-fg-2" : i === step ? "text-fg" : "text-fg-3"}`}>
                <span className="inline-flex h-5 w-5 items-center justify-center">
                  {i < step ? <Check size={15} className="text-good" /> : i === step ? <LoaderCircle size={15} className="animate-spin text-accent" /> : <span className="h-1.5 w-1.5 rounded-full bg-line-2" />}
                </span>
                {label}
              </li>
            ))}
          </ol>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">Name</span>
              <input autoFocus className={`${field} h-10`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Cyber insurance for SMBs" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">What should Radar track?</span>
              <textarea
                className={`${field} py-2.5 leading-relaxed`}
                rows={5}
                maxLength={2000}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="The market, the angle you care about, companies and people to follow, and anything to leave out."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
                }}
              />
            </label>
            <div>
              <div className="label mb-2">Or start from an example</div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.name}
                    type="button"
                    onClick={() => {
                      setName(ex.name);
                      setBrief(ex.brief);
                    }}
                    className="h-7 rounded-full border border-line px-3 text-[12px] text-fg-2 hover:border-line-2 hover:text-fg"
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            </div>
            {error ? <p className="text-[13px] text-bad">{error}</p> : null}
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <span className="text-[12px] text-fg-3">{busy ? "This takes about a minute." : aiOn ? "Uses one Claude call, about $0.10." : ""}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon={Sparkles} loading={busy} onClick={submit}>
              Create topic
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
