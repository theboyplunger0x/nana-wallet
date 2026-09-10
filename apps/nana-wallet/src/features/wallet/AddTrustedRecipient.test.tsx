import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContact: vi.fn(),
  deleteContact: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    createContact: (...args: unknown[]) => mocks.createContact(...args),
    deleteContact: (...args: unknown[]) => mocks.deleteContact(...args),
  },
  queryKeys: {
    contacts: (userId: string | undefined) => ["contacts", userId],
  },
  getErrorMessage: (error: unknown) => String(error),
}));

import { AddTrustedRecipient } from "./AddTrustedRecipient";

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const CONTACT = {
  id: "c1",
  name: "Lucas",
  description: "",
  address: "0x9999999999999999999999999999999999999999",
  version: 1,
  status: "active" as const,
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
};

describe("AddTrustedRecipient (wallet-profile scope decision)", () => {
  beforeEach(() => {
    mocks.createContact.mockReset();
    mocks.deleteContact.mockReset();
    mocks.refetch.mockReset().mockResolvedValue(CONTACT);
  });

  it("adds a trusted recipient with name and address and refreshes the allowlist", async () => {
    mocks.createContact.mockResolvedValue(CONTACT);
    render(
      <Wrapper>
        <AddTrustedRecipient userId="u1" onContactsChanged={mocks.refetch} />
      </Wrapper>,
    );

    await userEvent.click(screen.getByTestId("add-recipient"));
    await userEvent.type(screen.getByLabelText("Nombre"), "Lucas");
    await userEvent.type(
      screen.getByLabelText("Dirección"),
      "0x9999999999999999999999999999999999999999",
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(mocks.createContact).toHaveBeenCalledWith({
        name: "Lucas",
        description: "",
        address: "0x9999999999999999999999999999999999999999",
      });
    });
    await waitFor(() => {
      expect(mocks.refetch).toHaveBeenCalled();
    });
    // The form closes after a successful save.
    await waitFor(() => {
      expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
    });
  });

  it("surfaces a recoverable error without losing the form", async () => {
    mocks.createContact.mockRejectedValue(new Error("Dirección inválida."));
    render(
      <Wrapper>
        <AddTrustedRecipient userId="u1" onContactsChanged={mocks.refetch} />
      </Wrapper>,
    );

    await userEvent.click(screen.getByTestId("add-recipient"));
    await userEvent.type(screen.getByLabelText("Nombre"), "Lucas");
    await userEvent.type(
      screen.getByLabelText("Dirección"),
      "0x9999999999999999999999999999999999999999",
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Dirección inválida.");
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it("requires both fields before saving", async () => {
    render(
      <Wrapper>
        <AddTrustedRecipient userId="u1" onContactsChanged={mocks.refetch} />
      </Wrapper>,
    );

    await userEvent.click(screen.getByTestId("add-recipient"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.createContact).not.toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent).toContain("nombre");
  });
});
