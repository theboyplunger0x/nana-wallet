import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  contactSchema,
  createContactInputSchema,
  revealedCbuSchema,
  updateContactInputSchema,
  type Contact,
  type MeResponse,
  type RevealedCbu,
} from "../contracts/http.js";
import {
  ContactsConflictError,
  ContactsNotFoundError,
  ContactsRepository,
  ContactsValidationError,
} from "../memory/contacts-repository.js";
import { PrivyIdentityError } from "../auth/privy-identity.js";
import {
  EmbeddingService,
  recipientEmbeddingText,
} from "../memory/embedding.js";
import { EMBEDDING_MODEL_ID } from "../memory/types.js";
import { readRecipientMemoryConfig } from "../config/env.js";

export type ContactEmbedder = {
  embed(text: string): Promise<number[]>;
};

export type ContactsRouteDependencies = {
  resolveUserId(request: FastifyRequest): Promise<string>;
  contacts: ContactsRepository;
  embedder: ContactEmbedder;
};

export type ContactApiError = {
  ok: false;
  error: { code: string; message: string };
};

export type ContactReply = {
  code(status: number): { send(payload: ContactApiError): void };
};

function errorReply(reply: ContactReply, error: unknown): ContactApiError {
  // Identity failures map to 401 via the server-wide handler, never 500.
  if (error instanceof PrivyIdentityError) throw error;
  if (error instanceof ContactsValidationError) {
    reply.code(422);
    return {
      ok: false,
      error: { code: "DATOS_INVALIDOS", message: error.message },
    };
  }
  if (error instanceof ContactsConflictError) {
    reply.code(409);
    return {
      ok: false,
      error: {
        code: "VERSION_OBSOLETA",
        message:
          "The contact changed. Refresh and retry with the current version.",
      },
    };
  }
  if (error instanceof ContactsNotFoundError) {
    reply.code(404);
    return {
      ok: false,
      error: { code: "CONTACTO_NO_ENCONTRADO", message: "Contact not found." },
    };
  }
  reply.code(500);
  return {
    ok: false,
    error: { code: "ERROR_INTERNO", message: "Unexpected contacts error." },
  };
}

/**
 * /v1/contacts (PMU-008..013): user-scoped contacts CRUD over the recipients
 * projection, RLS-scoped through the resolved internal UUID, with versioned
 * updates (expectedVersion -> 409), soft delete and tap-to-copy reveal.
 */
export async function registerContactsRoutes(
  app: FastifyInstance,
  dependencies: ContactsRouteDependencies,
): Promise<void> {
  app.get(
    "/v1/contacts",
    async (
      request,
      reply,
    ): Promise<
      | { ok: true; data: Contact[] }
      | { ok: false; error: { code: string; message: string } }
    > => {
      try {
        const userId = await dependencies.resolveUserId(request);
        const contacts = await dependencies.contacts.listActive(userId);
        return {
          ok: true,
          data: contacts.map((contact) => contactSchema.parse(contact)),
        };
      } catch (error) {
        return errorReply(reply, error);
      }
    },
  );

  app.post(
    "/v1/contacts",
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply,
    ): Promise<
      | { ok: true; data: Contact }
      | { ok: false; error: { code: string; message: string } }
    > => {
      const parsed = createContactInputSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(422);
        return {
          ok: false,
          error: { code: "DATOS_INVALIDOS", message: parsed.error.message },
        };
      }
      try {
        const userId = await dependencies.resolveUserId(request);
        const embedding = await dependencies.embedder.embed(
          recipientEmbeddingText(parsed.data.name, parsed.data.description),
        );
        const contact = await dependencies.contacts.create(
          userId,
          parsed.data,
          embedding,
          EMBEDDING_MODEL_ID,
        );
        reply.code(201);
        return { ok: true, data: contactSchema.parse(contact) };
      } catch (error) {
        return errorReply(reply, error);
      }
    },
  );

  app.patch(
    "/v1/contacts/:id",
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply,
    ): Promise<
      | { ok: true; data: Contact }
      | { ok: false; error: { code: string; message: string } }
    > => {
      const parsed = updateContactInputSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(422);
        return {
          ok: false,
          error: { code: "DATOS_INVALIDOS", message: parsed.error.message },
        };
      }
      if (
        parsed.data.name === undefined &&
        parsed.data.description === undefined &&
        parsed.data.address === undefined
      ) {
        reply.code(422);
        return {
          ok: false,
          error: {
            code: "DATOS_INVALIDOS",
            message: "At least one editable field is required.",
          },
        };
      }
      try {
        const userId = await dependencies.resolveUserId(request);
        // Embed the merged next projection (any embedded field may have changed).
        const current = await dependencies.contacts
          .listActive(userId)
          .then((list) =>
            list.find((contact) => contact.id === request.params.id),
          );
        const name = parsed.data.name ?? current?.name ?? "";
        const description =
          parsed.data.description ?? current?.description ?? "";
        const embedding = await dependencies.embedder.embed(
          recipientEmbeddingText(name, description),
        );
        const contact = await dependencies.contacts.update(
          userId,
          request.params.id,
          parsed.data,
          embedding,
          EMBEDDING_MODEL_ID,
        );
        return { ok: true, data: contactSchema.parse(contact) };
      } catch (error) {
        return errorReply(reply, error);
      }
    },
  );

  app.delete(
    "/v1/contacts/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply,
    ): Promise<
      | { ok: true; data: Contact }
      | { ok: false; error: { code: string; message: string } }
    > => {
      try {
        const userId = await dependencies.resolveUserId(request);
        const contact = await dependencies.contacts.archive(
          userId,
          request.params.id,
        );
        if (!contact) {
          reply.code(404);
          return {
            ok: false,
            error: {
              code: "CONTACTO_NO_ENCONTRADO",
              message: "Contact not found.",
            },
          };
        }
        return { ok: true, data: contactSchema.parse(contact) };
      } catch (error) {
        return errorReply(reply, error);
      }
    },
  );

  app.post(
    "/v1/contacts/:id/reveal-cbu",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply,
    ): Promise<
      | { ok: true; data: RevealedCbu }
      | { ok: false; error: { code: string; message: string } }
    > => {
      try {
        const userId = await dependencies.resolveUserId(request);
        const address = await dependencies.contacts.revealAddress(
          userId,
          request.params.id,
        );
        if (!address) {
          reply.code(404);
          return {
            ok: false,
            error: {
              code: "CONTACTO_NO_ENCONTRADO",
              message: "Contact not found.",
            },
          };
        }
        return {
          ok: true,
          data: revealedCbuSchema.parse({ id: request.params.id, address }),
        };
      } catch (error) {
        return errorReply(reply, error);
      }
    },
  );
}

/** Builds the contacts embedder from the configured recipient-memory settings. */
export function createContactsEmbedder(
  environment: NodeJS.ProcessEnv = process.env,
): ContactEmbedder {
  const config = readRecipientMemoryConfig(environment);
  return new EmbeddingService(config.modelCacheDirectory);
}

export type { MeResponse };
