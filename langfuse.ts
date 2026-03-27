import { LangfuseClient } from "@langfuse/client";
import { CallbackHandler } from "@langfuse/langchain";
import {
  observe,
  startActiveObservation,
  getActiveTraceId,
  updateActiveTrace,
  getLangfuseTracerProvider,
  setLangfuseTracerProvider,
} from "@langfuse/tracing";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { logger } from "../logger.js";

let langfuseClient: LangfuseClient | null = null;
let tracerProvider: NodeTracerProvider | null = null;

export function initializeTracerProvider(): NodeTracerProvider {
  if (tracerProvider) {
    return tracerProvider;
  }

  try {
    // Create the span processor that sends traces to Langfuse
    const langfuseSpanProcessor = new LangfuseSpanProcessor();

    // Create the tracer provider with the Langfuse span processor
    tracerProvider = new NodeTracerProvider({
      spanProcessors: [langfuseSpanProcessor],
    });

    // Register it as the Langfuse tracer provider
    setLangfuseTracerProvider(tracerProvider);

    logger.info("Langfuse OpenTelemetry tracer provider initialized", {
      baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
    });

    return tracerProvider;
  } catch (error) {
    logger.error("Error initializing Langfuse tracer provider", { error });
    throw new Error(
      `Failed to initialize tracer provider: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function initializeLangfuse(): LangfuseClient {
  const apiKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;

  if (!apiKey || !publicKey) {
    throw new Error(
      "LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY are required for observability"
    );
  }

  try {
    // First initialize the tracer provider (for OpenTelemetry tracing)
    initializeTracerProvider();

    // Then initialize the Langfuse client (for direct API calls)
    langfuseClient = new LangfuseClient();

    logger.info("Langfuse client initialized successfully (cloud)");
    return langfuseClient;
  } catch (error) {
    logger.error("Error initializing Langfuse client", { error });
    throw new Error(
      `Failed to initialize Langfuse: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function getLangfuseClient(): LangfuseClient {
  if (!langfuseClient) {
    langfuseClient = initializeLangfuse();
  }
  return langfuseClient;
}

export function getLangfuseCallbackHandler(
  userId?: string,
  metadata?: Record<string, any>
): CallbackHandler {
  const apiKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;

  if (!apiKey || !publicKey) {
    throw new Error(
      "LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY are required for observability"
    );
  }

  try {
    const params: any = {};
    if (userId) params.userId = userId;
    if (metadata) params.traceMetadata = metadata;

    return new CallbackHandler(params);
  } catch (error) {
    logger.error("Error creating Langfuse CallbackHandler", { error });
    throw new Error(
      `Failed to create CallbackHandler: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Flush all pending Langfuse traces to the backend.
 * This flushes BOTH the OpenTelemetry tracer provider (used by @langfuse/tracing)
 * AND the LangfuseClient (used for direct API calls).
 */
export async function flushLangfuse(): Promise<void> {
  try {
    // 1. Flush our tracer provider (preferred) or fall back to getLangfuseTracerProvider
    const provider = tracerProvider || getLangfuseTracerProvider();

    logger.debug("Attempting to flush Langfuse traces", {
      hasTracerProvider: !!provider,
      tracerProviderType: provider?.constructor?.name,
      hasForceFlush: typeof (provider as any)?.forceFlush === "function",
    });

    if (provider && typeof (provider as any).forceFlush === "function") {
      await (provider as any).forceFlush();
      logger.debug("OpenTelemetry tracer provider flushed successfully");
    } else {
      logger.warn(
        "OpenTelemetry tracer provider does not have forceFlush method or is null"
      );
    }

    // 2. Flush LangfuseClient (for direct API calls)
    const client = getLangfuseClient();
    if (client && typeof client.flush === "function") {
      await client.flush();
      logger.debug("LangfuseClient flushed successfully");
    }

    logger.debug("Langfuse flush completed");
  } catch (error) {
    logger.error("Error flushing Langfuse traces", { error });
    // Don't throw - flushing is best effort
  }
}

/**
 * Shutdown Langfuse gracefully - flushes and closes connections.
 */
export async function shutdownLangfuse(): Promise<void> {
  try {
    // 1. Shutdown our tracer provider (preferred) or fall back to getLangfuseTracerProvider
    const provider = tracerProvider || getLangfuseTracerProvider();
    if (provider && typeof (provider as any).shutdown === "function") {
      await (provider as any).shutdown();
      logger.info("OpenTelemetry tracer provider shutdown");
    }

    // 2. Shutdown LangfuseClient
    const client = getLangfuseClient();
    if (client && typeof client.shutdown === "function") {
      await client.shutdown();
      logger.info("LangfuseClient shutdown");
    }

    logger.info("Langfuse shutdown successfully");
  } catch (error) {
    logger.error("Error shutting down Langfuse", { error });
  }
}

export async function observeWithContext<T>(
  name: string,
  fn: (span: any) => Promise<T>,
  input?: Record<string, any>
): Promise<T> {
  try {
    const result = await startActiveObservation(name, async (span: any) => {
      // Set input if provided
      if (input && span.update) {
        span.update({ input });
      }

      // Execute the function
      const output = await fn(span);

      // Set output (serialize if it's an object)
      if (span.update) {
        try {
          const serializedOutput =
            typeof output === "object"
              ? JSON.parse(JSON.stringify(output))
              : output;
          span.update({ output: serializedOutput });
        } catch {
          span.update({ output: { result: String(output) } });
        }
      }

      return output;
    });

    // Flush traces to Langfuse after observation completes
    await flushLangfuse();

    return result;
  } catch (error) {
    // Still flush even on error to capture the failed trace
    await flushLangfuse();
    throw error;
  }
}

export function getTrace() {
  return {
    id: getActiveTraceId(),
  };
}

export { observe, startActiveObservation, getActiveTraceId, updateActiveTrace };

try {
  langfuseClient = initializeLangfuse();
} catch (error) {
  logger.error("Failed to initialize Langfuse client on module load", {
    error,
  });
  throw error;
}
