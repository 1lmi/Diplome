import { useLocalSearchParams } from "expo-router";

import { AddressFormScreen } from "@/src/screens/AddressFormScreen";

export default function EditAddressRoute() {
  const params = useLocalSearchParams<{ id: string; origin?: "catalog" | "profile" }>();
  return (
    <AddressFormScreen
      addressId={Number(params.id)}
      origin={params.origin === "catalog" ? "catalog" : "profile"}
    />
  );
}
