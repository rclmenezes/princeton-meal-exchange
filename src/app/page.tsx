import { HomeActions } from "@/components/home-actions";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
      <nav className="flex items-center justify-between gap-4 border-b border-black/10 pb-4">
        <div>
          <p className="text-sm font-medium tracking-wide text-[var(--muted)] uppercase">
            Princeton
          </p>
          <h1 className="text-2xl font-semibold">Meal Exchange</h1>
        </div>
        <HomeActions />
      </nav>

      <section className="grid flex-1 place-items-center py-16">
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-medium tracking-wide text-[var(--accent)] uppercase">
            Starter app
          </p>
          <h2 className="text-4xl font-semibold tracking-normal sm:text-6xl">
            Share meals with less coordination overhead.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
            Sign in with a secure email link or Princeton TigerNet to start
            coordinating meal exchanges.
          </p>
        </div>
      </section>
    </main>
  );
}
