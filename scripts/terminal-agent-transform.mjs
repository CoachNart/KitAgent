import fs from 'node:fs';

const path='src/main.jsx';
let s=fs.readFileSync(path,'utf8');

if(!s.includes("./agent/conversation.js")){
  s=s.replace("import {classify,parseSend,parseDefi} from './agent/intent.js';", "import {classify,parseSend,parseDefi} from './agent/intent.js';\nimport {isAddress,isYes,isNo,addresses,parseAmount,parseSwap,parseBridge,parseApproval,parseNft,parseDeFiCommand} from './agent/conversation.js';");
}
if(!s.includes('const[agentPending,setAgentPending]'))s=s.replace("const[currentIntent", "const[agentPending,setAgentPending]=useState(null);const[currentIntent");

const start=' async function buildPlan(){';
const endMarker=' async function sendNative(){';
const i=s.indexOf(start); const j=s.indexOf(endMarker,i);
if(i>=0&&j>i){
const fn=` async function buildPlan(){
  const text=command.trim();
  if(!text)return;
  try{
    if(agentPending?.kind==='approval'){
      if(isNo(text)){setAgentPending(null);setNotice('Cancelled. Nothing was signed or broadcast.');setCommand('');return}
      if(isYes(text)){
        const p=agentPending;setAgentPending(null);setCommand('');
        await executeTx(p.tx,p.label||'Transaction');return;
      }
      setNotice('This transaction is ready. Type “yes” to open your wallet for approval, or “cancel”.');return;
    }
    if(agentPending?.kind==='send-recipient'){
      if(isAddress(text)){setSendTo(text);setSendAmount(agentPending.amount||'0.01');setAgentPending({kind:'send-confirm',recipient:text,amount:agentPending.amount||'0.01'});setNotice('Recipient locked. I can prepare the ETH transfer now. Type “yes” to simulate it and open your wallet, or “cancel”.');setCommand('');return}
      setNotice('That is not a valid EVM address. Paste the 0x recipient address.');return;
    }
    if(agentPending?.kind==='send-confirm'){
      if(isNo(text)){setAgentPending(null);setNotice('Cancelled.');setCommand('');return}
      if(isYes(text)){const tx={from:account,to:agentPending.recipient,value:toHex(agentPending.amount)};setAgentPending({kind:'approval',tx,label:'ETH transfer'});await preflightTx(tx,'ETH transfer');setNotice('Transaction simulated. Type “yes” again to open your wallet for final approval.');setCommand('');return}
      setNotice('Type “yes” to continue or “cancel”.');return;
    }
    if(agentPending?.kind==='nft-recipient'){
      if(isAddress(text)){setAgentPending({kind:'nft-asset',recipient:text});setNftRecipient(text);setAction('nft');setNotice('Recipient locked. Give me the NFT contract and token ID, or paste an OpenSea NFT URL.');setCommand('');return}
      setNotice('Paste a valid 0x recipient address.');return;
    }
    if(agentPending?.kind==='nft-asset'){
      const n=parseNft(text); if(n.contract&&n.tokenId){setNftContract(n.contract);setNftTokenId(n.tokenId);const data=nftStandard==='721'?erc721Transfer(account,agentPending.recipient,n.tokenId):erc1155Transfer(account,agentPending.recipient,n.tokenId,1);const tx={from:account,to:n.contract,data,value:'0x0'};setAgentPending({kind:'approval',tx,label:\`ERC-\${nftStandard} transfer\`});await preflightTx(tx,\`ERC-\${nftStandard} transfer\`);setNotice('NFT transfer simulated. Type “yes” to open your wallet, or “cancel”.');setCommand('');return} 
      setNotice('I need the NFT contract address and token ID. Example: 0x… token 381');return;
    }
    const l=text.toLowerCase();
    const agentKind=classifyTerminalCommand(text);
    if(agentKind==='nft-send'){
      const n=parseNft(text);
      if(!n.recipient){setAgentPending({kind:'nft-recipient'});setAction('nft');setNotice('Sure. What wallet address should receive the NFT? Paste it here and press Enter.');setCommand('');return}
      if(!n.contract||!n.tokenId){setAgentPending({kind:'nft-asset',recipient:n.recipient});setAction('nft');setNotice('Recipient locked. Give me the NFT contract and token ID, or paste an OpenSea NFT URL.');setCommand('');return}
      const data=nftStandard==='721'?erc721Transfer(account,n.recipient,n.tokenId):erc1155Transfer(account,n.recipient,n.tokenId,1);const tx={from:account,to:n.contract,data,value:'0x0'};setAgentPending({kind:'approval',tx,label:\`ERC-\${nftStandard} transfer\`});await preflightTx(tx,\`ERC-\${nftStandard} transfer\`);setNotice('NFT transfer simulated. Type “yes” to open your wallet, or “cancel”.');setCommand('');return;
    }
    if(agentKind==='portfolio'){setMode('portfolio');setCommand('');return}
    if(agentKind==='faucet'){requestTestTokens();setCommand('');return}
    if(agentKind==='gas'){setAction('contract');setNotice('Tell me the transaction you want the gas estimate for. I will simulate it without signing.');setCommand('');return}
    if(agentKind==='send'){
      const p=parseSend(text);const amount=p.amount||parseAmount(text);
      if(!p.address){setAgentPending({kind:'send-recipient',amount:amount||'0.01'});setAction('send');setNotice('Who should receive it? Paste the wallet address and press Enter.');setCommand('');return}
      const tx={from:account,to:p.address,value:toHex(amount||'0.01')};await preflightTx(tx,'ETH transfer');setAgentPending({kind:'approval',tx,label:'ETH transfer'});setNotice(\`Ready: send \${amount||'0.01'} ETH to \${shorten(p.address)}. Type “yes” to open your wallet, or “cancel”.\`);setCommand('');return;
    }
    if(agentKind==='swap'){
      setAction('swap');const q=parseSwap(text);if(!q.amount||!q.from||!q.to){setNotice('I need the swap amount and both tokens. Example: “swap 25 USDC for ETH”.');setCommand('');return}await findRoute(false);setNotice('Swap route prepared. Review the quote, then type “yes” to continue to wallet approval.');setCommand('');return;
    }
    if(agentKind==='bridge'){
      setAction('bridge');const q=parseBridge(text);if(!q.amount||!q.from||!q.destination){setNotice('I need the amount, token, and destination chain. Example: “bridge 100 USDC to Base”.');setCommand('');return}await findRoute(true);setNotice('Bridge route prepared. Review it, then type “yes” to continue.');setCommand('');return;
    }
    if(agentKind==='defi'){
      setAction('defi');const d=parseDeFiCommand(text);if(!d.action||!d.amount||!d.token){setNotice('Tell me the DeFi action, amount and asset. Example: “supply 100 USDC”.');setCommand('');return}setNotice(\`I understood: \${d.action} \${d.amount} \${d.token}. I will prepare and simulate it before wallet approval.\`);await buildDefi();setCommand('');return;
    }
    if(agentKind==='approve'){
      const a=parseApproval(text);if(!a.token||!a.spender||!a.amount){setAction('send');setNotice('I need the token contract, spender address and amount for a safe approval. Example: “approve 0xTOKEN to 0xSPENDER for 5000000”.');setCommand('');return}
      const tx={from:account,to:a.token,data:erc20Approve(a.spender,toHex(a.amount)),value:'0x0'};await preflightTx(tx,'ERC-20 approval');setAgentPending({kind:'approval',tx,label:'ERC-20 approval'});setNotice('Approval simulated. Type “yes” to open your wallet, or “cancel”.');setCommand('');return;
    }
    if(agentKind==='contract'){setAction('contract');setNotice('Contract mode ready. Give me the target contract and call details; I will simulate before asking for wallet approval.');setCommand('');return}
    if(agentKind==='batch'){setAction('batch');setNotice('Batch mode ready. Describe the calls in plain English; I will validate and show the complete batch before approval.');setCommand('');return}
    if(/\\b(sell|list)\\b.*\\bnft\\b/i.test(text)){setNotice('OpenSea selling is being prepared through the OpenSea marketplace flow. Give me the NFT and price, then I will show the listing details before wallet signature.');setCommand('');return}
    setNotice('Tell me what you want to do in plain English. I will collect only missing details, simulate the transaction, show you exactly what will happen, then ask your wallet for final approval.');setCommand('');
  }catch(e){setNotice(e.message||'I could not prepare that request')}
 }`;
s=s.slice(0,i)+fn+s.slice(j);
}
fs.writeFileSync(path,s);console.log('Conversational transaction orchestration applied');
