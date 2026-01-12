import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "./use-debounce";

interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

interface UseSearchOptions {
  pageSize?: number;
  debounceMs?: number;
  enabled?: boolean;
  initialFilters?: Record<string, string>;
}

interface UseSearchResult<T> {
  data: T[];
  total: number;
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  startIndex: number;
  endIndex: number;
  refetch: () => void;
}

export function useSearch<T>(
  endpoint: string,
  options: UseSearchOptions = {}
): UseSearchResult<T> {
  const { 
    pageSize = 25, 
    debounceMs = 300, 
    enabled = true,
    initialFilters = {} 
  } = options;

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearch = useDebounce(searchQuery, debounceMs);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String((currentPage - 1) * pageSize));
    
    if (debouncedSearch.trim()) {
      params.set("search", debouncedSearch.trim());
    }
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "All" && !value.startsWith("All ")) {
        params.set(key, value);
      }
    });
    
    return params.toString();
  }, [pageSize, currentPage, debouncedSearch, filters]);

  const queryKey = useMemo(() => {
    return [endpoint, { page: currentPage, search: debouncedSearch, filters }];
  }, [endpoint, currentPage, debouncedSearch, filters]);

  const { data: response, isLoading, refetch } = useQuery<PaginatedResponse<T>>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${endpoint}?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch data");
      return res.json();
    },
    enabled,
    staleTime: 30 * 1000,
  });

  const total = response?.total ?? 0;
  const data = response?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setFilter = useCallback((key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearchQuery("");
    setCurrentPage(1);
  }, [initialFilters]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) setCurrentPage(p => p + 1);
  }, [currentPage, totalPages]);

  const prevPage = useCallback(() => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  }, [currentPage]);

  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  }, []);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);

  return {
    data,
    total,
    isLoading,
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    filters,
    setFilter,
    clearFilters,
    currentPage,
    totalPages,
    pageSize,
    goToPage,
    nextPage,
    prevPage,
    startIndex,
    endIndex,
    refetch,
  };
}
