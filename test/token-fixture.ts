import {DurableObject} from 'cloudflare:workers';
import {tokenStore} from '../src/token-store';
export class Store extends DurableObject {
  fetch(request:Request){return tokenStore(request,this.ctx.storage,'dummy-key');}
}
export default {fetch(request:Request,env:{STORE:DurableObjectNamespace<Store>}){return env.STORE.getByName('owner').fetch(request);}};
