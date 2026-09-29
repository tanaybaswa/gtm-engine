// Shown while the console's first screen is on its way.
export default function Loading() {
  return (
    <div className="backdrop flex h-dvh overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 border-r border-line bg-panel/70 p-4 lg:block">
        <div className="skeleton h-6 w-28" />
        <div className="mt-8 space-y-2">
          <div className="skeleton h-12" />
          <div className="skeleton h-12 opacity-60" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-[97px] border-b border-line bg-panel/70 p-4">
          <div className="skeleton h-6 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-[84px] !rounded-xl" />
          ))}
        </div>
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden px-4 pb-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-full w-[312px] shrink-0 !rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
