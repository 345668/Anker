import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

interface UseFullDatasetOptions {
  batchSize?: number;
  enabled?: boolean;
}

interface UseFullDatasetResult<T> {
  data: T[];
  total: number;
  isLoading: boolean;
  isHydrating: boolean;
  progress: number;
  error: Error | null;
  refetch: () => void;
}

export function useFullDataset<T>(
  endpoint: string,
  options: UseFullDatasetOptions = {}
): UseFullDatasetResult<T> {
  const { batchSize = 500, enabled = true } = options;
  const [allData, setAllData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [isHydrating, setIsHydrating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: initialResponse, isLoading, refetch: refetchInitial } = useQuery<PaginatedResponse<T>>({
    queryKey: [endpoint, { limit: batchSize, offset: 0 }],
    queryFn: async () => {
      const response = await fetch(`${endpoint}?limit=${batchSize}&offset=0`);
      if (!response.ok) throw new Error("Failed to fetch data");
      return response.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const hydrateRemainingData = useCallback(async () => {
    if (!initialResponse || initialResponse.total <= batchSize) return;

    setIsHydrating(true);
    abortControllerRef.current = new AbortController();

    try {
      const totalRecords = initialResponse.total;
      const batches = Math.ceil((totalRecords - batchSize) / batchSize);
      const fetchedData: T[] = [...initialResponse.data];

      for (let i = 1; i <= batches; i++) {
        if (abortControllerRef.current?.signal.aborted) break;

        const offset = i * batchSize;
        const response = await fetch(
          `${endpoint}?limit=${batchSize}&offset=${offset}`,
          { signal: abortControllerRef.current.signal }
        );
        
        if (!response.ok) throw new Error("Failed to fetch batch");
        
        const batch: PaginatedResponse<T> = await response.json();
        fetchedData.push(...batch.data);
        
        setAllData([...fetchedData]);
        setProgress(Math.min(100, Math.round((fetchedData.length / totalRecords) * 100)));
      }

      setProgress(100);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err);
      }
    } finally {
      setIsHydrating(false);
    }
  }, [initialResponse, batchSize, endpoint]);

  useEffect(() => {
    if (initialResponse) {
      setTotal(initialResponse.total);
      setAllData(initialResponse.data);
      setProgress(Math.min(100, Math.round((initialResponse.data.length / initialResponse.total) * 100)));
      
      if (initialResponse.total > batchSize) {
        hydrateRemainingData();
      } else {
        setProgress(100);
      }
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [initialResponse, batchSize, hydrateRemainingData]);

  const refetch = useCallback(() => {
    abortControllerRef.current?.abort();
    setAllData([]);
    setTotal(0);
    setProgress(0);
    setError(null);
    queryClient.invalidateQueries({ queryKey: [endpoint] });
    refetchInitial();
  }, [queryClient, endpoint, refetchInitial]);

  return {
    data: allData,
    total,
    isLoading,
    isHydrating,
    progress,
    error,
    refetch,
  };
}

export function useClientPagination<T>(
  data: T[],
  pageSize: number = 25
) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(data.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageData = data.slice(startIndex, endIndex);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)));
  }, [totalPages]);

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  }, [currentPage, totalPages]);

  const prevPage = useCallback(() => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  }, [currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return {
    pageData,
    currentPage,
    totalPages,
    pageSize,
    goToPage,
    nextPage,
    prevPage,
    startIndex,
    endIndex: Math.min(endIndex, data.length),
  };
}
