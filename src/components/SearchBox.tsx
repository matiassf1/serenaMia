export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <form action="/" method="get" role="search" className="flex gap-2">
      <label htmlFor="q" className="sr-only">
        Buscar productos
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Buscar productos"
        className="min-h-12 min-w-0 flex-1 rounded-full border-2 border-blush-border bg-white px-4 text-base placeholder:text-muted"
      />
      <button
        type="submit"
        className="min-h-12 rounded-full bg-brand-deep px-5 text-base font-semibold text-white active:bg-brand-ink"
      >
        Buscar
      </button>
    </form>
  )
}
