export const ADDRESS_RE=/^0x[a-fA-F0-9]{40}$/;
export const HEX_RE=/^0x[0-9a-fA-F]*$/;
export const ERC20={transfer:'0xa9059cbb',approve:'0x095ea7b3',allowance:'0xdd62ed3e',balanceOf:'0x70a08231',decimals:'0x313ce567',symbol:'0x95d89b41',name:'0x06fdde03'};
export const ERC721={safeTransfer:'0x42842e0e',approve:'0x095ea7b3',setApproval:'0xa22cb465'};
export const ERC1155={safeTransfer:'0xf242432a',setApproval:'0xa22cb465'};
const word=v=>String(v).replace(/^0x/,'').padStart(64,'0');
export const addressWord=a=>word(a);
export const uintWord=n=>word(BigInt(n).toString(16));
export function parseAmount(text){const m=String(text||'').match(/\b\d+(?:\.\d+)?\b/);return m?.[0]||''}
export function parseAddress(text){return String(text||'').match(/0x[a-fA-F0-9]{40}/)?.[0]||''}
export function assertAmount(value){if(!/^\d+(?:\.\d+)?$/.test(String(value||''))||Number(value)<0)throw new Error('Amount must be a non-negative decimal');}
export function toBase(value,decimals=18){assertAmount(value);const [w='0',f=''] = String(value).split('.'); if(f.length>decimals) throw new Error(`Amount has more than ${decimals} decimals`); return BigInt(`${w}${f.padEnd(decimals,'0')}`)}
export const toHex=(v,d=18)=>`0x${toBase(v,d).toString(16)}`;
export function fromBase(value,decimals=18){try{const n=BigInt(value||0),b=10n**BigInt(decimals),w=n/b,f=(n%b).toString().padStart(decimals,'0').replace(/0+$/,'');return f?`${w}.${f.slice(0,8)}`:w.toString()}catch{return '0'}}
export const erc20Transfer=(to,a,d)=>`${ERC20.transfer}${addressWord(to)}${uintWord(toBase(a,d))}`;
export const erc20Approve=(spender,a,d)=>`${ERC20.approve}${addressWord(spender)}${uintWord(toBase(a,d))}`;
export const erc20Allowance=(owner,spender)=>`${ERC20.allowance}${addressWord(owner)}${addressWord(spender)}`;
export const erc20BalanceOf=owner=>`${ERC20.balanceOf}${addressWord(owner)}`;
export const erc721Transfer=(from,to,id)=>`${ERC721.safeTransfer}${addressWord(from)}${addressWord(to)}${uintWord(id)}`;
export const erc1155Transfer=(from,to,id,amount)=>`${ERC1155.safeTransfer}${addressWord(from)}${addressWord(to)}${uintWord(id)}${uintWord(amount)}${uintWord(0xa0)}${uintWord(0)}`;
export const setApprovalForAll=(operator,on)=>`${ERC721.setApproval}${addressWord(operator)}${uintWord(on?1:0)}`;
