import { call } from './rpc.js';

const TRANSFER_SELECTOR = 'a9059cbb';
const APPROVE_SELECTOR = '095ea7b3';
const BALANCE_OF_SELECTOR = '70a08231';
const DECIMALS_SELECTOR = '313ce567';

function strip0x(value) {
  return String(value || '').replace(/^0x/, '');
}

function pad64(value) {
  return value.padStart(64, '0');
}

function addressWord(address) {
  return pad64(strip0x(address).toLowerCase());
}

function uintWord(value) {
  const hex = BigInt(value).toString(16);
  return pad64(hex);
}

export function encodeTransfer(to, amount) {
  return `0x${TRANSFER_SELECTOR}${addressWord(to)}${uintWord(amount)}`;
}

export function encodeApprove(spender, amount) {
  return `0x${APPROVE_SELECTOR}${addressWord(spender)}${uintWord(amount)}`;
}

export function encodeBalanceOf(owner) {
  return `0x${BALANCE_OF_SELECTOR}${addressWord(owner)}`;
}

export async function getDecimals(token) {
  const result = await call({
    to: token,
    data: `0x${DECIMALS_SELECTOR}`,
  });

  return Number(BigInt(result));
}

export async function getTokenBalance(token, owner) {
  const result = await call({
    to: token,
    data: encodeBalanceOf(owner),
  });

  return BigInt(result);
}

export function parseUnits(value, decimals) {
  const input = String(value).trim();

  if (!/^\d+(\.\d+)?$/.test(input)) {
    throw new Error(`Invalid token amount: ${value}`);
  }

  const [whole, fraction = ''] = input.split('.');

  if (fraction.length > decimals) {
    throw new Error(`Too many decimal places for this token`);
  }

  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || 0)
  );
}

export function formatUnits(value, decimals) {
  const amount = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fraction = amount % base;

  if (fraction === 0n) return whole.toString();

  return `${whole}.${fraction
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '')}`;
}
