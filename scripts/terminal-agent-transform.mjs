import fs from 'node:fs';

const path='src/main.jsx';
let s=fs.readFileSync(path,'utf8');

if(!s.includes("./agent/terminal-agent.js")){
  s=s.replace("import {classify,parseSend,parseDefi} from './agent/intent.js';", "import {classify,parseSend,parseDefi} from './agent/intent.js';\nimport {classifyTerminalCommand,parseTerminalNft,looksLikeAddress} from './agent/terminal-agent.js';");
}

if(!s.includes('const[agentPending,setAgentPending]')){
  s=s.replace("const[currentIntent", "const[agentPending,setAgentPending]=useState(null);const[currentIntent");
}

const start=' async function buildPlan(){';
const endMarker=' async function sendNative(){';
const i=s.indexOf(start);
const j=s.indexOf(endMarker,i);
if(i>=0&&j>i){
  const fn=` async function buildPlan(){
  const text=command.trim();
  if(!text)return;
  try{
    const agentKind=classifyTerminalCommand(text);
    if(agentPending?.kind==='nft-send'){
      const parsed=parseTerminalNft(text);
      if(agentPending.step==='recipient'&&looksLikeAddress(text)){
        setAgentPending({kind:'nft-send',step:'asset',recipient:text.trim()});
        setNftRecipient(text.trim());
        setAction('nft');
        setNotice('Recipient locked. Now give me the NFT contract address and token ID.');
        setCommand('');
        return;
      }
      if(agentPending.step==='asset'&&(parsed.contract||nftContract)&&parsed.tokenId){
        const recipient=agentPending.recipient;
        const contract=parsed.contract||nftContract;
        setNftRecipient(recipient);setNftContract(contract);setNftTokenId(parsed.tokenId);
        setAgentPending(null);setCommand('');
        const data=nftStandard==='721'?erc721Transfer(account,recipient,parsed.tokenId):erc1155Transfer(account,recipient,parsed.tokenId,1);
        await executeTx({from:account,to:contract,data,value:'0x0'},\`ERC-\${nftStandard} transfer\`);
        return;
      }
    }
    if(agentKind==='nft-send'){
      const parsed=parseTerminalNft(text);
      if(!parsed.address){setAgentPending({kind:'nft-send',step:'recipient'});setAction('nft');setNotice('Sure. What address should I send the NFT to? Paste the wallet address here and press Enter.');return;}
      if(!parsed.contract||!parsed.tokenId){setAgentPending({kind:'nft-send',step:'asset',recipient:parsed.address});setAction('nft');setNotice('Recipient locked. Now give me the NFT contract address and token ID.');return;}
      const data=nftStandard==='721'?erc721Transfer(account,parsed.address,parsed.tokenId):erc1155Transfer(account,parsed.address,parsed.tokenId,1);
      await executeTx({from:account,to:parsed.contract,data,value:'0x0'},\`ERC-\${nftStandard} transfer\`);return;
    }
    if(agentKind==='portfolio'){setMode('portfolio');return}
    if(agentKind==='faucet'){setMode('faucet');return}
    if(agentKind==='gas'){setAction('contract');setNotice('I will simulate the requested transaction and show the exact estimated gas before anything is signed.');return}
    if(agentKind==='send'){
      const p=parseSend(text);
      if(!p.address){setAction('send');setNotice('Who should receive it? Paste the wallet address here and press Enter.');setAgentPending({kind:'send-recipient'});return}
      setSendTo(p.address);setSendAmount(p.amount||'0.01');
      await executeTx({from:account,to:p.address,value:toHex(p.amount||'0.01')},'ETH transfer');return;
    }
    if(agentKind==='swap'){setAction('swap');await findRoute(false);return}
    if(agentKind==='bridge'){setAction('bridge');await findRoute(true);return}
    if(agentKind==='defi'){setAction('defi');await buildDefi();return}
    if(agentKind==='approve'){setAction('send');setNotice('Tell me which token and spender to approve, including the amount. I will simulate it, then ask your wallet to approve.');return}
    if(['contract','batch'].includes(agentKind)){setAction(agentKind);return}
    setNotice('Tell me what you want to do in plain English. I will prepare it, simulate it, and ask your wallet for the final approval.');
  }catch(e){setNotice(e.message||'I could not understand that request')}
 }`;
  s=s.slice(0,i)+fn+s.slice(j);
}

fs.writeFileSync(path,s);
console.log('KitAgent terminal-first agent flow applied');
