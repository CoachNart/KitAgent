export const ACTION_STATES = Object.freeze({
  DISCOVERED: 'discovered',
  PREPARED: 'prepared',
  SIMULATED: 'simulated',
  AWAITING_PERMISSION: 'awaiting_permission',
  SIGNING: 'signing',
  SUBMITTED: 'submitted',
  VERIFIED: 'verified',
  FAILED: 'failed',
});

export const createPlan = ({ id, adapter, title, chainId = 4663, from, transactions = [], expectedChanges = [], risk = [], metadata = {} }) => ({
  id: id || `${adapter}-${Date.now()}`,
  adapter,
  title,
  chainId,
  from,
  transactions,
  expectedChanges,
  risk,
  metadata,
  state: ACTION_STATES.PREPARED,
  requiresPermission: true,
  createdAt: new Date().toISOString(),
});

export const validatePlan = (plan) => {
  if (!plan?.adapter || !plan?.title || !plan?.chainId) throw new Error('Invalid transaction plan.');
  if (!Array.isArray(plan.transactions)) throw new Error('Transaction plan must contain a transaction list.');
  if (plan.transactions.some(tx => !tx?.to || !/^0x[0-9a-fA-F]{40}$/.test(tx.to))) throw new Error('Every transaction must have a valid destination.');
  return plan;
};

export const permissionRequired = (plan) => Boolean(plan?.requiresPermission && plan.transactions?.length);
