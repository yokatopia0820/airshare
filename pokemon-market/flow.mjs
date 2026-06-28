export function createSourcingFlow() {
  return { selectedGroupId: "", purchasePrice: "" };
}

export function selectSourcingCard(flow, groupId) {
  const selectedGroupId = String(groupId || "").trim();
  return selectedGroupId
    ? { selectedGroupId, purchasePrice: "" }
    : clearSourcingCard(flow);
}

export function setPurchasePrice(flow, value) {
  if (!flow?.selectedGroupId) return createSourcingFlow();
  return {
    selectedGroupId: flow.selectedGroupId,
    purchasePrice: String(value ?? "")
  };
}

export function clearSourcingCard() {
  return createSourcingFlow();
}
