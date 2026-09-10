import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";

import { RouteError, RoutePending } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { api, getErrorMessage, queryKeys } from "@/lib/api";
import { formatUsdcBalance } from "@/lib/usdc-format";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/api-types";

/**
 * wallet-profile (WP-010/WP-011/WP-012): identity plus the personal USDC
 * balance. The pesos total, quotes and simulated movements are preserved (but
 * not mounted) in `features/wallet/LegacyMoneySections.tsx` (WP-015).
 *
 * Balance read (WP-011): staleTime 30 s, refetchOnMount "always", no retry,
 * no polling, explicit refresh button. Error state wins over cached data so a
 * failed refresh always hides a previously shown amount. WalletLifecycle only
 * mounts after the explicit "Administrar billetera" action and never for the
 * balance read itself (WP-012).
 */

// Lazy: the lifecycle (contacts/permission queries) must never load just by
// opening the screen; it mounts only behind the explicit action.
const WalletLifecycle = lazy(() =>
  import("@/features/wallet/WalletLifecycle").then((module) => ({
    default: module.WalletLifecycle,
  })),
);

export const Route = createFileRoute("/mi-plata")({
  head: () => ({
    meta: [
      { title: "Billetera | Nana Wallet" },
      {
        name: "description",
        content: "Tu saldo USDC en Arc testnet, en letra grande y con la fecha de la consulta.",
      },
      { property: "og:title", content: "Billetera" },
      {
        property: "og:description",
        content: "Mirá tu saldo USDC y actualizalo cuando quieras.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: () => <RoutePending label="Estamos buscando tu plata" />,
  errorComponent: ({ error, reset }) => <RouteError error={error} onRetry={reset} />,
  component: MiPlataPage,
});

const NOT_READY_LABELS: Record<string, string> = {
  unprovisioned: "Tu billetera todavía no está preparada.",
  provisioning: "Estamos preparando tu billetera.",
  recovery_required: "Tu billetera necesita recuperación.",
  conflict: "Detectamos un conflicto con tu billetera.",
  unavailable: "Tu billetera no está disponible por ahora.",
};

function formatObservedAt(observedAt: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(observedAt));
}

/**
 * WP-012: "Administrar billetera" mounts WalletLifecycle only after the
 * explicit user action, in its own section. Its load/errors are independent
 * from the balance and never hide or replace the balance section. It does not
 * provision anything by itself; WalletLifecycle only reads when mounted.
 */
function ManageWalletSection({ userId }: { userId: string | undefined }) {
  const [isManaging, setIsManaging] = useState(false);

  if (!isManaging) {
    return (
      <Button
        type="button"
        variant="outline"
        className="press mt-4 min-h-12 w-full text-base font-extrabold"
        onClick={() => setIsManaging(true)}
        data-testid="manage-wallet"
      >
        <Wallet className="size-5" aria-hidden="true" />
        Administrar billetera
      </Button>
    );
  }

  return (
    <section className="mt-4" aria-label="Administrar billetera">
      <Suspense
        fallback={
          <p className="mt-4 text-base text-muted-foreground">Preparando la administración…</p>
        }
      >
        <WalletLifecycle userId={userId} />
      </Suspense>
    </section>
  );
}

function MiPlataPage() {
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: api.getMe });
  const userId = meQuery.data?.userId;

  const balancesQuery = useQuery({
    queryKey: queryKeys.balances(userId, ARC_TESTNET_CHAIN_ID),
    queryFn: api.getBalances,
    // WP-013: never query without a resolved identity.
    enabled: Boolean(userId),
    // WP-011: refresh on entry, no polling, no retry loop.
    staleTime: 30_000,
    refetchOnMount: "always",
    retry: false,
    refetchInterval: false,
  });

  // WP-011: the identity error renders before any dependent load.
  if (meQuery.isPending) return <RoutePending label="Estamos buscando tu plata" />;
  if (meQuery.isError) {
    return <RouteError error={meQuery.error} onRetry={() => void meQuery.refetch()} />;
  }

  if (balancesQuery.isPending) {
    return <RoutePending label="Estamos buscando tu saldo" />;
  }

  if (balancesQuery.isError) {
    // WP-011: error wins over data — a previous amount is never shown next to
    // a failed refresh.
    return (
      <main className="mx-auto max-w-md px-6 pt-12 pb-40">
        <h1 className="text-2xl font-extrabold">Billetera</h1>
        <section className="surface-card mt-5 p-5" role="alert">
          <h2 className="text-xl font-extrabold">No pudimos leer tu saldo</h2>
          <p className="mt-2 text-base text-muted-foreground">
            {getErrorMessage(balancesQuery.error)}
          </p>
          <Button
            type="button"
            variant="outline"
            className="press mt-4 min-h-12 w-full text-base font-extrabold"
            onClick={() => void balancesQuery.refetch()}
          >
            <RefreshCw className="size-5" aria-hidden="true" />
            Actualizar saldo
          </Button>
        </section>
      </main>
    );
  }

  const balances = balancesQuery.data;

  return (
    <main className="mx-auto max-w-md px-6 pt-12 pb-40">
      <h1 className="text-2xl font-extrabold">Billetera</h1>

      {balances.walletState === "ready" ? (
        <section className="relative mt-5 overflow-hidden rounded-[2rem] border border-foreground bg-foreground px-7 py-6 text-background">
          <span
            className="absolute -top-10 -right-8 size-28 rounded-full bg-primary"
            aria-hidden="true"
          />
          <div className="relative">
            <p className="text-base font-bold text-background/70">Tu saldo</p>
            {/* WP-010: exact string/BigInt format; es-AR separators. */}
            <p
              className="mt-1 break-words text-4xl font-extrabold tracking-tight"
              data-testid="usdc-balance"
            >
              {formatUsdcBalance(balances.assets[0]!.balanceAtomic)} USDC
            </p>
            <p className="mt-2 text-base font-bold text-background/70">Arc testnet</p>
            {balances.source === "fixture" ? (
              <p className="mt-2 inline-flex rounded-full bg-background/15 px-3 py-1 text-sm font-bold text-background/80">
                Monto de demostración
              </p>
            ) : null}
            <p className="mt-2 text-sm font-bold text-background/60">
              Consultado: {formatObservedAt(balances.observedAt)}
            </p>
          </div>
        </section>
      ) : (
        <section className="surface-card mt-5 p-5" role="status" data-testid="wallet-not-ready">
          <div className="flex items-center gap-2">
            <Wallet className="size-6 text-brand-ink" aria-hidden="true" />
            <h2 className="text-xl font-extrabold">Billetera</h2>
          </div>
          <p className="mt-2 text-lg text-muted-foreground">
            {NOT_READY_LABELS[balances.walletState] ?? "Tu billetera no está lista todavía."}
          </p>
          <p className="mt-1 text-base text-muted-foreground">Arc testnet</p>
        </section>
      )}

      <Button
        type="button"
        variant="outline"
        className="press mt-4 min-h-12 w-full text-base font-extrabold"
        onClick={() => void balancesQuery.refetch()}
      >
        <RefreshCw className="size-5" aria-hidden="true" />
        Actualizar saldo
      </Button>

      <ManageWalletSection userId={userId} />

      <section className="mt-10 rounded-2xl border border-border bg-secondary p-5">
        <p className="text-base text-muted-foreground">
          Acá ves tu saldo en USDC sobre Arc testnet. No mostramos pesos, cotizaciones ni
          movimientos simulados.
        </p>
      </section>
    </main>
  );
}
