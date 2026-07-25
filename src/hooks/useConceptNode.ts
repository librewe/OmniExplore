import { useCallback, useEffect, useRef, useState } from "react";
import { getConceptNode, putConceptNode } from "@/services/cache";
import type { ConceptNode } from "@/types";
import { useConfigStore } from "@/store/configStore";

export function useConceptNode(term: string) {
  const [node, setNode] = useState<ConceptNode | null>(null);
  const [loading, setLoading] = useState(false);
  const config = useConfigStore((s) => s.config);

  const loadNode = useCallback(async () => {
    if (!term) return;
    setLoading(true);
    try {
      const cached = await getConceptNode(term.toLowerCase());
      setNode(cached ?? null);
    } catch {
      setNode(null);
    } finally {
      setLoading(false);
    }
  }, [term]);

  const saveNode = useCallback(
    async (updated: ConceptNode) => {
      await putConceptNode(updated);
      setNode(updated);
    },
    []
  );

  useEffect(() => {
    loadNode();
  }, [loadNode]);

  const isConfigured = config !== null;

  return { node, loading, isConfigured, loadNode, saveNode };
}

export function useStreaming() {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startStreaming = useCallback(
    async (
      generator: AsyncGenerator<string>,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (err: Error) => void
    ) => {
      setIsStreaming(true);
      try {
        for await (const chunk of generator) {
          onChunk(chunk);
        }
        onDone();
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsStreaming(false);
      }
    },
    []
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { isStreaming, startStreaming, cancel };
}

export function useTermIndex() {
  const [termCache, setTermCache] = useState<Map<string, string>>(new Map());

  const loadTermIndex = useCallback(async () => {
    try {
      const { getAllConceptNodes } = await import("@/services/cache");
      const nodes = await getAllConceptNodes();
      const map = new Map<string, string>();
      for (const node of nodes) {
        const preview = node.micro_intuition?.split("。")[0]?.slice(0, 50) ?? null;
        if (preview) map.set(node.term.toLowerCase(), preview);
      }
      setTermCache(map);
    } catch {
      // IndexedDB not available
    }
  }, []);

  useEffect(() => {
    loadTermIndex();
  }, [loadTermIndex]);

  const getPreview = useCallback(
    (term: string): string | null => {
      return termCache.get(term.toLowerCase()) ?? null;
    },
    [termCache]
  );

  return { getPreview, refresh: loadTermIndex };
}
