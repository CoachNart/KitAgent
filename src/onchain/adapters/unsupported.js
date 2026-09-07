export function unsupportedAction(type, reason = '') {
  return {
    type,
    requiresApproval: false,
    executable: false,
    status: 'adapter-unavailable',
    summary:
      reason ||
      `The ${type} adapter is not available yet. No fake transaction will be generated.`,
  };
}
