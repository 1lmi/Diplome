export type ValidationErrors = Record<string, string>;

export const hasValidationErrors = (errors: ValidationErrors) => Object.keys(errors).length > 0;

export const focusFirstInvalidField = (
  selectors: string[],
  root: ParentNode = document
) => {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) continue;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    return element;
  }
  return null;
};
