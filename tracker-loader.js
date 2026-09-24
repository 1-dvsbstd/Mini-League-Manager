/* Cached first paint; independent, bounded core/history requests. No credentials stored. */
(function(root){
  function create({endpoint,leagueKey,adapt,render,status,fetcher=fetch,storage,preferBundle=false,timeoutMs=20000,historyTimeoutMs=30000,historyRetries=1,retryDelayMs=500,now=Date.now}){
    const cacheKey='baruc-tracker-v1:'+endpoint+':'+leagueKey;
    let running=null,visible=false,lastComplete=null;
    function cached(){try{const c=JSON.parse(storage?.getItem(cacheKey)||'null');return c&&c.endpoint===endpoint&&c.leagueKey===leagueKey&&now()-c.savedAt<7*86400000&&now()>=c.savedAt?c:null;}catch{return null;}}
    function save(raw,history){if(history)lastComplete={raw,history};try{storage?.setItem(cacheKey,JSON.stringify({endpoint,leagueKey,savedAt:now(),raw,history}));}catch{}}
    function show(raw,history,stale){const data=adapt(raw,leagueKey,history);render(raw,data,stale);visible=true;}
    async function request(action,budget,retry){
      for(let attempt=0;attempt<=retry;attempt++){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),budget);
        try{
          const url=new URL(endpoint);url.searchParams.set('action',action);url.searchParams.set('leagueKey',leagueKey);
          const response=await fetcher(url,{signal:controller.signal,cache:'no-store',credentials:'omit'});
          if(!response.ok)throw Error('HTTP '+response.status);
          const result=await response.json();
          if(result.ok===false){const error=Error(result.message||'League unavailable');error.code=result.code;error.permanent=!['HISTORY_UNAVAILABLE','REQUEST_FAILED'].includes(result.code);throw error;}
          return result;
        }catch(error){
          if(error.permanent||attempt===retry)throw error;
          status(action==='getTrackerHistory'?'Standings loaded. Retrying season history…':visible?'Showing saved results while retrying the update…':'The service is slow. Retrying once…');
          if(retryDelayMs)await new Promise(resolve=>setTimeout(resolve,retryDelayMs));
        }finally{clearTimeout(timer);}
      }
    }
    async function run(){
      if(!visible){const c=cached();if(c){try{show(c.raw,c.history,true);if(c.history)lastComplete={raw:c.raw,history:c.history};status('Showing saved results. Checking for updates…');}catch{try{storage?.removeItem(cacheKey);}catch{}}}}
      let raw;
      if(preferBundle){
        try{
          const bundle=await request('getTrackerBundle',timeoutMs,0);
          if(bundle.schemaVersion!==1||bundle.core?.ok!==true)throw Error('Invalid combined response');
          // Validate identities and shape before using or caching either part.
          adapt(bundle.core,leagueKey);
          raw=bundle.core;
          if(bundle.history?.ok===true){
            try{adapt(raw,leagueKey,bundle.history);show(raw,bundle.history,false);save(raw,bundle.history);return;}
            catch{ /* Use valid core immediately, then recover history separately. */ }
          }
        }catch(error){
          raw=undefined;
          if(error.permanent&&!['UNKNOWN_ACTION','INVALID_ACTION'].includes(error.code)){
            status(visible?'Could not refresh. Showing saved results; check their update time.':'Could not load this league. Please try again.',!visible);return;
          }
          status(visible?'Showing saved results. Trying the standard update…':'Trying the standard loading route…');
        }
      }
      try{raw=raw||await request('getTrackerData',timeoutMs,1);show(raw,undefined,false);
        // Keep a validated complete snapshot until its replacement succeeds.
        // Never attach old history to new core data: seasons/entrants/GWs may differ.
        if(!lastComplete||raw.capabilities?.history!==1)save(raw);
      }
      catch(error){status(visible?'Could not refresh. Showing saved results; check their update time.':'Could not load this league. Please try again.',!visible);return;}
      // Yield after main render. History never delays the first useful screen.
      if(raw.capabilities?.history===1){
        status('Standings loaded. Updating season history…');
        await new Promise(resolve=>setTimeout(resolve,0));
        try{const history=await request('getTrackerHistory',historyTimeoutMs,historyRetries);show(raw,history,false);save(raw,history);}
        catch{status('Standings loaded. History is temporarily unavailable.');}
      }
    }
    return {load(){if(!running)running=run().finally(()=>{running=null;});return running;}};
  }
  if(typeof module==='object'&&module.exports)module.exports={create};else root.TrackerLoader={create};
})(typeof window==='object'?window:globalThis);

