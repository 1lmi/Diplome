import { useQuery } from "@tanstack/react-query";

import { mobileApi } from "@/src/api/mobile-api";

export function useMenuData() {
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: mobileApi.getCategories,
  });

  const menuQuery = useQuery({
    queryKey: ["menu"],
    queryFn: () => mobileApi.getMenu(),
  });

  return {
    categoriesQuery,
    menuQuery,
  };
}
