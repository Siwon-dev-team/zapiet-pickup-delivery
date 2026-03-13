import type {
  CartDeliveryOptionsTransformRunInput,
  CartDeliveryOptionsTransformRunResult,
} from "../generated/api";

const NO_CHANGES: CartDeliveryOptionsTransformRunResult = {
  operations: [],
};

type MethodType = "pickup" | "delivery" | null;

export function cartDeliveryOptionsTransformRun(input: CartDeliveryOptionsTransformRunInput): CartDeliveryOptionsTransformRunResult {
  const methodType = parseMethodType(input?.cart?.attribute?.value);
  if (!methodType) {
    return NO_CHANGES;
  }

  const operations = input.cart.deliveryGroups.flatMap((group) =>
    group.deliveryOptions
      .filter((option) => shouldHideOption(option.code, methodType))
      .map((option) => ({
        deliveryOptionHide: {
          deliveryOptionHandle: option.handle,
        },
      })),
  );

  return operations.length > 0 ? { operations } : NO_CHANGES;
}

function parseMethodType(rawValue?: string | null): MethodType {
  if (!rawValue) {
    return null;
  }

  const value = rawValue.trim().toLowerCase();

  if (value.startsWith("pickup")) {
    return "pickup";
  }

  if (value.startsWith("delivery")) {
    return "delivery";
  }

  return null;
}

function shouldHideOption(optionCode: string | null | undefined, selectedMethod: Exclude<MethodType, null>): boolean {
  if (!optionCode) {
    return false;
  }

  const code = optionCode.trim().toLowerCase();

  if (selectedMethod === "pickup") {
    return code.startsWith("delivery_");
  }

  return code.startsWith("pickup_");
}