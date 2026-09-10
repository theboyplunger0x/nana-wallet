import { useSigners } from "@privy-io/react-auth";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * PEW-014: the user-authenticated half of signer enrollment. This component is
 * rendered ONLY inside the Privy tree (privy mode) and is lazy-loaded so the demo
 * bundle never imports `useSigners` (which would throw outside PrivyProvider).
 *
 * ⚠️ SDK SHAPE NOTE: the documented call shape is `addSigners({ params: {
 * walletAddress, signers: [{ keyQuorumId, policyIds: [policyId] }] } })`, but the
 * pinned `@privy-io/react-auth` release the app ships exposes
 * `addSigners({ address, signers: [{ signerId, policyIds }] })`. We bind to the
 * ACTUAL installed SDK so the frontend builds and typechecks; the server-side
 * complete-readback is what actually proves the signer + policy attached.
 *
 * The backend policy id is the single override policy for this signer (one policy
 * per signer, per docs). The user consents in the Privy modal.
 */
export function PrivySignerEnrollment({
  walletAddress,
  quorumId,
  policyId,
  busy,
  onEnrolled,
  onError,
}: {
  walletAddress: string;
  quorumId: string;
  policyId: string;
  busy: boolean;
  onEnrolled: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { addSigners } = useSigners();
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    try {
      await addSigners({
        address: walletAddress,
        signers: [{ signerId: quorumId, policyIds: [policyId] }],
      });
      toast.success("Confirmaste el firmante en Privy.");
      await onEnrolled();
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "No pudimos confirmar el firmante con Privy.",
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <Button
      type="button"
      className="press mt-4 min-h-14 w-full text-base font-extrabold"
      onClick={() => void handleAdd()}
      disabled={busy || adding}
    >
      {busy || adding ? (
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      ) : (
        <ShieldCheck className="size-5" aria-hidden="true" />
      )}
      Autorizar firmante en Privy
    </Button>
  );
}
