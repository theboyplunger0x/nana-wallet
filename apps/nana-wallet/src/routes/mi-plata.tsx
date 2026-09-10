import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Sparkles } from "lucide-react";

import { EmptyState, RouteError, RoutePending } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { api, getErrorMessage, queryKeys } from "@/lib/api";

export const Route = createFileRoute("/mi-plata")({
  head: () => ({
    meta: [
      { title: "Mi plata | Nana Wallet" },
      {
        name: "description",
        content:
          "Saldo en pesos, dólares y plazo fijo, con los últimos movimientos en letra grande.",
      },
      { property: "og:title", content: "Mi plata" },
      {
        property: "og:description",
        content: "Mirá cuánto tenés y qué entró o salió este mes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: () => <RoutePending label="Estamos buscando tu plata" />,
  errorComponent: ({ error, reset }) => <RouteError error={error} onRetry={reset} />,
  component: MiPlataPage,
});

function compactMoney(display: string) {
  return display.replace("$ ", "$");
}

function MiPlataPage() {
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: api.getMe });
  const userId = meQuery.data?.userId;
  const summaryQuery = useQuery({
    queryKey: queryKeys.wallet(userId),
    queryFn: api.getWalletSummary,
    enabled: Boolean(userId),
  });
  const movementsQuery = useQuery({
    queryKey: queryKeys.movements(userId),
    queryFn: () => api.getMovements({ limit: 20 }),
    enabled: Boolean(userId),
  });

  if (meQuery.isPending || summaryQuery.isPending) {
    return <RoutePending label="Estamos buscando tu plata" />;
  }
  const error = meQuery.error ?? summaryQuery.error;
  if (error) {
    return (
      <RouteError
        error={error}
        onRetry={() => {
          void summaryQuery.refetch();
        }}
      />
    );
  }
  if (!summaryQuery.data) {
    return <RoutePending label="Estamos buscando tu plata" />;
  }

  const summary = summaryQuery.data;
  const movements = movementsQuery.data?.items ?? [];

  return (
    <main className="mx-auto max-w-md px-6 pt-12 pb-40">
      <h1 className="text-2xl font-extrabold">Mi plata</h1>

      <section className="relative mt-5 overflow-hidden rounded-[2rem] border border-foreground bg-foreground px-7 py-6 text-background">
        <span
          className="absolute -top-10 -right-8 size-28 rounded-full bg-primary"
          aria-hidden="true"
        />
        <Sparkles
          className="absolute top-6 right-6 size-7 text-primary-foreground"
          strokeWidth={2.4}
          aria-hidden="true"
        />
        <div className="relative">
          <p className="text-base font-bold text-background/70">Saldo disponible</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{summary.total.display}</p>
        </div>
      </section>

      <h2 className="mt-10 text-xl font-extrabold">Dónde está tu plata</h2>
      {summary.accounts.length === 0 ? (
        <EmptyState>No encontramos cuentas para mostrarte. Probá de nuevo en un ratito.</EmptyState>
      ) : (
        <ul className="mt-4 space-y-3">
          {summary.accounts.map((account) => (
            <li
              key={account.id}
              className="surface-card flex items-center justify-between gap-3 p-5"
            >
              <div>
                <p className="text-lg font-bold">{account.name}</p>
                <p className="text-base text-muted-foreground">{account.subtitle}</p>
              </div>
              <p className="text-right text-lg font-extrabold">{account.balance.display}</p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-xl font-extrabold">Últimos movimientos</h2>
      {movementsQuery.isPending ? (
        <EmptyState>Estamos buscando tus movimientos…</EmptyState>
      ) : movementsQuery.error ? (
        <section className="surface-card mt-4 p-5" role="alert">
          <AlertCircle className="size-7 text-destructive" aria-hidden="true" />
          <p className="mt-2 text-lg font-bold">No pudimos cargar tus movimientos.</p>
          <p className="mt-1 text-base text-muted-foreground">
            {getErrorMessage(movementsQuery.error)} El saldo de arriba sí corresponde a tu
            billetera.
          </p>
          <Button
            type="button"
            variant="outline"
            className="press mt-4 min-h-12 w-full text-base font-extrabold"
            onClick={() => void movementsQuery.refetch()}
          >
            Probar de nuevo
          </Button>
        </section>
      ) : movements.length === 0 ? (
        <EmptyState>
          Todavía no tenés movimientos para mostrar. Cuando entre o salga plata, va a aparecer acá.
        </EmptyState>
      ) : (
        <ul className="mt-4 space-y-3">
          {movements.map((movement) => (
            <li key={movement.id} className="surface-card flex items-center gap-4 p-4">
              <span
                className={
                  movement.kind === "entrada"
                    ? "rounded-xl bg-success-surface text-success-surface-foreground border border-border p-3 text-success"
                    : "rounded-xl bg-destructive-surface text-destructive-surface-foreground border border-border p-3 text-destructive"
                }
                aria-hidden="true"
              >
                {movement.kind === "entrada" ? (
                  <ArrowDownLeft className="size-6" strokeWidth={2.6} />
                ) : (
                  <ArrowUpRight className="size-6" strokeWidth={2.6} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{movement.title}</p>
                <p className="text-base text-muted-foreground">{movement.subtitle}</p>
              </div>
              <p className="text-right text-base font-extrabold">
                {movement.kind === "entrada" ? "Te entró " : "Pagaste "}
                {compactMoney(movement.amount.display)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
