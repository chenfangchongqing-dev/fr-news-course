import {handle} from '../lib/server';
export default {fetch(req:Request){return handle(req,new URL(req.url).pathname.split('/').filter(Boolean).slice(1))}};
