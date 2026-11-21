import {handle} from '../../../lib/server';
export const dynamic='force-dynamic';
async function route(req:Request,{params}:{params:Promise<{path:string[]}>}){const res=await handle(req,(await params).path);res.headers.set('Cache-Control','private, no-store');return res}
export const GET=route;export const POST=route;export const PATCH=route;export const DELETE=route;
