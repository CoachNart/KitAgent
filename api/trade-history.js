import { tradesHandler } from '../server/market-engine/publication.js';
export default (req,res)=>tradesHandler('history',req,res);
