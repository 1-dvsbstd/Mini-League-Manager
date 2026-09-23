const assert=require('node:assert/strict');
const {create}=require('./tracker-loader.js');
const turn=()=>new Promise(resolve=>setTimeout(resolve,5));
function harness(options={}){
 const entries=new Map(),requests=[],renders=[],messages=[];
 const storage={getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
 const config={endpoint:'https://test.example/api',leagueKey:'sample01',storage,
  adapt:(raw,key,history)=>{if(raw.leagueKey!==key)throw Error('Wrong league');if(history&&history.leagueKey!==key)throw Error('Wrong history');return {raw,history};},
  render:(raw,data,stale)=>renders.push({raw,data,stale}),status:m=>messages.push(m),
  fetcher:(url,opts)=>new Promise((resolve,reject)=>{requests.push({action:url.searchParams.get('action'),resolve:body=>resolve({ok:true,json:async()=>body}),reject});opts.signal.addEventListener('abort',()=>reject(Error('timeout')));}),...options};
 return {entries,requests,renders,messages,config,loader:create(config)};
}
const raw={ok:true,leagueKey:'sample01',capabilities:{history:1}};
(async()=>{
 const h=harness();const load=h.loader.load();assert.equal(h.loader.load(),load);assert.equal(h.requests.length,1);
 h.requests[0].resolve(raw);await turn();assert.equal(h.renders.length,1,'core must render before history resolves');assert.equal(h.requests[1].action,'getTrackerHistory');
 h.requests[1].reject(Error('unavailable'));await load;assert.equal(h.renders.length,1);assert.match(h.messages.at(-1),/Standings loaded/);
 const second=create(h.config);const cachedLoad=second.load();assert.equal(h.renders[1].stale,true,'cache renders before network');h.requests[2].reject(Error('network'));await turn();h.requests[3].resolve({...raw,capabilities:{}});await cachedLoad;assert.equal(h.renders.at(-1).stale,false);
 const other=create({...h.config,leagueKey:'other001'});const count=h.renders.length;const otherLoad=other.load();assert.equal(h.renders.length,count,'different league must not see cache');h.requests.at(-1).resolve({ok:false,message:'Not found'});await otherLoad;
 const denied=harness({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});const deniedLoad=denied.loader.load();denied.requests[0].resolve({...raw,capabilities:{}});await deniedLoad;assert.equal(denied.renders.length,1);
 const history=harness();const withHistory=history.loader.load();history.requests[0].resolve(raw);await turn();history.requests[1].resolve({leagueKey:'sample01'});await withHistory;assert.equal(history.renders.length,2);assert.ok(history.renders[1].data.history);
 const timeout=harness({timeoutMs:5});await timeout.loader.load();assert.equal(timeout.requests.length,2,'one automatic retry only');assert.equal(timeout.renders.length,0);
 console.log('PASS: main screen before history, cached first render, source/league isolation, coalesced loads, history failure, storage denied, successful history, bounded timeout/retry.');
})().catch(e=>{console.error(e);process.exitCode=1;});
