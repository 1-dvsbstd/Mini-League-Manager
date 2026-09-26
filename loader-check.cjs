const assert=require('node:assert/strict');
const {create}=require('./tracker-loader.js');
const turn=()=>new Promise(resolve=>setTimeout(resolve,5));
function harness(options={}){
 const entries=new Map(),requests=[],renders=[],messages=[];
 const storage={getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
 const config={endpoint:'https://test.example/api',leagueKey:'sample01',storage,historyRetries:0,retryDelayMs:0,
  adapt:(raw,key,history)=>{if(raw.leagueKey!==key)throw Error('Wrong league');if(history&&history.leagueKey!==key)throw Error('Wrong history');return {raw,history};},
  render:(raw,data,stale)=>renders.push({raw,data,stale}),status:m=>messages.push(m),
  fetcher:(url,opts)=>new Promise((resolve,reject)=>{requests.push({url:String(url),action:url.searchParams.get('action'),resolve:body=>resolve({ok:true,json:async()=>body}),reject});opts.signal.addEventListener('abort',()=>reject(Error('timeout')));}),...options};
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
 const retained=harness();let run=retained.loader.load();retained.requests[0].resolve(raw);await turn();retained.requests[1].resolve({leagueKey:'sample01'});await run;
 const stored=[...retained.entries.values()][0];run=retained.loader.load();retained.requests[2].resolve({...raw,dataUpdatedAt:'newer'});await turn();retained.requests[3].reject(Error('network'));await run;
 assert.equal([...retained.entries.values()][0],stored,'failed history refresh must preserve last complete snapshot');
 assert.equal(retained.renders.at(-1).data.history,undefined,'old history must not be paired with newer standings');
 const recovered=harness({historyRetries:1});run=recovered.loader.load();recovered.requests[0].resolve(raw);await turn();recovered.requests[1].reject(Error('network'));await turn();assert.equal(recovered.requests[2].action,'getTrackerHistory');recovered.requests[2].resolve({leagueKey:'sample01'});await run;assert.ok(recovered.renders.at(-1).data.history);
 const stopped=harness({historyRetries:1});run=stopped.loader.load();stopped.requests[0].resolve(raw);await turn();stopped.requests[1].resolve({ok:false,code:'LEAGUE_NOT_FOUND'});await run;assert.equal(stopped.requests.length,2,'permanent history error should not retry');
 const temporary=harness({historyRetries:1});run=temporary.loader.load();temporary.requests[0].resolve(raw);await turn();temporary.requests[1].resolve({ok:false,code:'HISTORY_UNAVAILABLE'});await turn();assert.equal(temporary.requests.length,3);temporary.requests[2].resolve({leagueKey:'sample01'});await run;assert.ok(temporary.renders.at(-1).data.history);
 const combined=harness({preferBundle:true});run=combined.loader.load();assert.equal(combined.requests[0].action,'getTrackerBundle');combined.requests[0].resolve({ok:true,schemaVersion:1,core:raw,history:{ok:true,leagueKey:'sample01'}});await run;assert.equal(combined.requests.length,1);assert.ok(combined.renders[0].data.history);
 const fallback=harness({preferBundle:true});run=fallback.loader.load();fallback.requests[0].resolve({ok:false,code:'UNKNOWN_ACTION'});await turn();assert.equal(fallback.requests[1].action,'getTrackerData');fallback.requests[1].resolve({...raw,capabilities:{}});await run;assert.equal(fallback.renders.length,1);
 const partial=harness({preferBundle:true});run=partial.loader.load();partial.requests[0].resolve({ok:true,schemaVersion:1,core:raw,history:{ok:false,code:'HISTORY_UNAVAILABLE'}});await turn();assert.equal(partial.renders.length,1);assert.equal(partial.requests[1].action,'getTrackerHistory');partial.requests[1].resolve({ok:true,leagueKey:'sample01'});await run;assert.ok(partial.renders.at(-1).data.history);
 const wrong=harness({preferBundle:true});run=wrong.loader.load();wrong.requests[0].resolve({ok:true,schemaVersion:1,core:raw,history:{ok:true,leagueKey:'different'}});await turn();assert.equal(wrong.renders[0].data.history,undefined);wrong.requests[1].resolve({ok:true,leagueKey:'sample01'});await run;
 const missing=harness({preferBundle:true});run=missing.loader.load();missing.requests[0].resolve({ok:false,code:'LEAGUE_NOT_FOUND'});await run;assert.equal(missing.requests.length,1);assert.equal(missing.renders.length,0);
 const fresh=harness({freshRequests:true,now:()=>100});run=fresh.loader.load();fresh.requests[0].reject(Error('network'));await turn();fresh.requests[1].resolve(raw);await turn();fresh.requests[2].resolve({ok:true,leagueKey:'sample01'});await run;
 const tokens=fresh.requests.map(r=>new URL(r.url).searchParams.get('_request'));
 assert.ok(tokens.every(Boolean));assert.equal(new Set(tokens).size,3,'retry gets distinct request identity even with a fixed clock');
 assert.equal(fresh.entries.size,1,'request identity must not fragment saved league snapshots');
 assert.equal(new URL(h.requests[0].url).searchParams.has('_request'),false,'unchanged by default');
 console.log('PASS standard loading/cache/retry; one-request bundle, old-server fallback, partial/wrong history recovery and permanent error handling.');
})().catch(e=>{console.error(e);process.exitCode=1;});
