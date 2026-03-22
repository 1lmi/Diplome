import { useLocalSearchParams } from "expo-router";

import { AddressFormScreen } from "@/src/screens/AddressFormScreen";

export default function NewAddressRoute() {
  const params = useLocalSearchParams<{ origin?: "catalog" | "profile" }>();
  return <AddressFormScreen origin={params.origin === "catalog" ? "catalog" : "profile"} />;
}
