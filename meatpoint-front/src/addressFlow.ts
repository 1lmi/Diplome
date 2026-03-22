export type AddressDetails = {
  entrance: string;
  intercom: string;
  floor: string;
  apartment: string;
};

export type ParsedStoredAddress = {
  baseAddress: string;
  details: AddressDetails;
};

export const emptyAddressDetails: AddressDetails = {
  entrance: "",
  intercom: "",
  floor: "",
  apartment: "",
};

export function parseStoredAddress(value?: string | null): ParsedStoredAddress {
  if (!value) {
    return {
      baseAddress: "",
      details: { ...emptyAddressDetails },
    };
  }

  const [baseLine = "", detailLine = ""] = value.split(/\r?\n/, 2);

  return {
    baseAddress: baseLine.trim(),
    details: {
      entrance: detailLine.match(/под[ъь]езд\s+([^,]+)/i)?.[1]?.trim() || "",
      intercom: detailLine.match(/домофон\s+([^,]+)/i)?.[1]?.trim() || "",
      floor: detailLine.match(/этаж\s+([^,]+)/i)?.[1]?.trim() || "",
      apartment: detailLine.match(/квартира\s+([^,]+)/i)?.[1]?.trim() || "",
    },
  };
}

export function buildStoredAddress(baseAddress: string, details: AddressDetails): string {
  const normalizedBase = baseAddress.trim();
  const detailParts = [
    details.entrance.trim() ? `подъезд ${details.entrance.trim()}` : "",
    details.intercom.trim() ? `домофон ${details.intercom.trim()}` : "",
    details.floor.trim() ? `этаж ${details.floor.trim()}` : "",
    details.apartment.trim() ? `квартира ${details.apartment.trim()}` : "",
  ].filter(Boolean);

  return detailParts.length
    ? `${normalizedBase}\n${detailParts.join(", ")}`
    : normalizedBase;
}
