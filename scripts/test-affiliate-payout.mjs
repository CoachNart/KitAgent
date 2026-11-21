import assert from 'node:assert/strict';
import handler,{successfulPayoutResult} from '../api/affiliate-payout.js';

assert.equal(typeof handler,'function','affiliate payout API must load with its runtime dependencies');
assert.deepEqual(successfulPayoutResult('affiliate-1',20,'0x'+'a'.repeat(64)),{
  affiliateId:'affiliate-1',status:'paid',amount:20,transactionHash:'0x'+'a'.repeat(64)
});
console.log('Affiliate payout runtime and success-ledger regression passed.');
