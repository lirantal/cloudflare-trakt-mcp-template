import worker from '../src/index';
import { DurableObject } from 'cloudflare:workers';
export default worker;
export class FakeContainer extends DurableObject {
  async fetch(request: Request) {
    return Response.json({url:request.url, method:request.method, headers:Object.fromEntries(request.headers), body:await request.text()});
  }
}

