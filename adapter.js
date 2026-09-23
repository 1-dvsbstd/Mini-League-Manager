/* Data boundary for the original Baruc's League renderer. No personal backend calls. */
(function(root){
  const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
  const rank=(rows,field)=>{
    const sorted=[...rows].sort((a,b)=>(number(b[field])??-Infinity)-(number(a[field])??-Infinity)||a.managerId-b.managerId);
    let previous,place;
    return sorted.map((m,i)=>{const score=number(m[field]);if(i===0||score!==previous)place=i+1;previous=score;return {...m,place:score===null?null:place};});
  };
  function adapt(data,key,history){
    if(data?.ok!==true)throw new Error('This tracker could not be loaded. Check the shared link.');
    if(data.leagueKey!==key||!data.league?.name||!data.season?.key||!Array.isArray(data.managers)||!data.gameweek||!data.coverage||!data.prizes?.overall||!Array.isArray(data.prizes?.recurring?.periods)||!Array.isArray(data.periodHistory)||!data.overallFinal)throw new Error('The league response is incomplete.');
    const ids=data.managers.map(m=>number(m.managerId));
    if(ids.some(id=>!Number.isInteger(id)||id<1)||new Set(ids).size!==ids.length)throw new Error('The league response contains invalid manager identities.');
    const current=number(data.gameweek.current),upcoming=data.gameweek.status==='upcoming'&&!data.gameweek.isLive;
    const managers=data.managers.map(m=>{
      const notStarted=number(m.startGw)>current||(number(m.startGw)===current&&upcoming);
      const gw=m.currentGameweek;
      return {...m,notStarted,overallPoints:notStarted||m.dataAvailable===false?null:number(m.overallPoints),netPoints:notStarted?null:number(gw?.netPoints),activeChip:({'3xc':'tc','bboost':'bb','freehit':'fh','wildcard':'wc'})[gw?.activeChip]||null,transfersMade:number(gw?.transfers),hits:number(gw?.hitCost),transfersText:gw?.transfers===null||gw?.transfers===undefined?'Unavailable':null};
    });
    const overallRanks=new Map(rank(managers,'overallPoints').map(m=>[m.managerId,m.place]));
    const standings=rank(managers,'netPoints').map(m=>({...m,uiMeta:{notParticipating:m.notStarted,upcoming,weeklyRank:data.coverage.currentGameweekComplete===true?m.place:null,overallRank:data.coverage.complete===true?overallRanks.get(m.managerId):null,rankMovement:null,form:[null,null,null,null,null],fiveGwAverage:null}}));
    // Keep the opening period available before launch; later periods stay hidden.
    const paidPeriods=data.prizes.recurring.periods.filter(p=>number(p.pot)>0&&number(p.startGw)>=1).sort((a,b)=>Number(a.startGw)-Number(b.startGw));
    const startedPeriods=paidPeriods.filter(p=>current!==null&&(upcoming?number(p.startGw)<current:number(p.startGw)<=current));
    const visiblePeriods=startedPeriods.length?startedPeriods:paidPeriods.slice(0,1);
    const monthly=visiblePeriods.map(p=>{
      const final=data.periodHistory.find(h=>String(h.id)===String(p.id)&&h.complete===true);
      const live=String(data.currentPeriod?.id)===String(p.id)?data.currentPeriod:null;
      const result=final||live;
      const byId=new Map((result?.standings||[]).map(s=>[Number(s.managerId),s]));
      return {title:`GW${p.startGw}${p.startGw===p.endGw?'':'–'+p.endGw}`,startGw:Number(p.startGw),endGw:Number(p.endGw),payouts:p.payouts||[],complete:!!final,awards:final?.awards||[],scores:managers.map(m=>({managerId:m.managerId,name:m.managerName,teamName:m.teamName,score:m.notStarted?null:number(byId.get(m.managerId)?.score)}))};
    });
    const final=data.overallFinal.complete===true;
    const finalScores=new Map((data.overallFinal.standings||[]).map(m=>[Number(m.managerId),number(m.score)]));
    const overallManagers=rank(managers.map(m=>({...m,overallPoints:final?finalScores.get(m.managerId)??null:m.overallPoints})),'overallPoints');
    let gameweeks=current?[{gameweek:current,isLive:data.gameweek.isLive===true,isUpcoming:upcoming,deadline:data.gameweek.deadline,finalised:data.gameweek.finalised===true,standings}]:[];
    if(history){
      if(history.ok!==true||history.schemaVersion!==1||history.leagueKey!==key||history.seasonKey!==data.season.key||!Array.isArray(history.gameweeks))throw new Error('Gameweek history does not match this league and season.');
      const expectedFirst=current?Math.min(current,...managers.map(m=>number(m.startGw)||1)):null;
      if(history.gameweeks.length!==(current?current-expectedFirst+1:0)||history.gameweeks.some(gw=>gw.gameweek<expectedFirst))throw new Error('Gameweek history has missing weeks.');
      const seen=new Set(),totals=new Map(),recent=new Map(),previousRanks=new Map();
      let cumulativeComplete=true;
      gameweeks=[...history.gameweeks].sort((a,b)=>a.gameweek-b.gameweek).map(gw=>{
        if(!Number.isInteger(gw.gameweek)||gw.gameweek<1||gw.gameweek>current||seen.has(gw.gameweek)||!Array.isArray(gw.standings))throw new Error('Gameweek history contains invalid entries.');
        if(seen.size && !seen.has(gw.gameweek-1)) cumulativeComplete=false;
        seen.add(gw.gameweek);
        const rowIds=gw.standings.map(m=>Number(m.managerId));
        if(new Set(rowIds).size!==rowIds.length||rowIds.some(id=>!ids.includes(id)))throw new Error('Gameweek history contains invalid managers.');
        const byId=new Map(gw.standings.map(m=>[Number(m.managerId),m]));
        const rows=managers.map(m=>{
          const row=byId.get(m.managerId),notStarted=gw.gameweek<(number(m.startGw)||1)||gw.isUpcoming===true;
          const netPoints=notStarted?null:number(row?.netPoints);
          if(!notStarted && netPoints===null)cumulativeComplete=false;
          if(netPoints!==null)totals.set(m.managerId,(totals.get(m.managerId)||0)+netPoints);
          return {...m,...row,managerId:m.managerId,managerName:m.managerName,teamName:m.teamName,netPoints,notStarted,transfersMade:number(row?.transfers),hits:number(row?.hitCost),activeChip:({'3xc':'tc','bboost':'bb','freehit':'fh','wildcard':'wc'})[row?.activeChip]||null};
        });
        const weeklyComplete=gw.complete===true&&rows.every(m=>m.notStarted||m.netPoints!==null);
        const seasonRanks=new Map(rank(rows.map(m=>({...m,total:m.notStarted?null:totals.get(m.managerId)})),'total').map(m=>[m.managerId,m.place]));
        const sorted=rank(rows,'netPoints').map(m=>{
          const prior=recent.get(m.managerId)||[];
          if(!m.notStarted)prior.push({score:m.netPoints,place:weeklyComplete?m.place:null});
          recent.set(m.managerId,prior);
          const last=prior.slice(-5),overallRank=cumulativeComplete?seasonRanks.get(m.managerId):null;
          const oldRank=previousRanks.get(m.managerId);previousRanks.set(m.managerId,overallRank);
          return {...m,uiMeta:{notParticipating:m.notStarted,upcoming:gw.isUpcoming===true,weeklyRank:weeklyComplete?m.place:null,overallRank,rankMovement:oldRank&&overallRank?oldRank-overallRank:null,form:Array(Math.max(0,5-last.length)).fill(null).concat(last.map(x=>x.place)),fiveGwAverage:last.length&&last.every(x=>x.score!==null)?last.reduce((sum,x)=>sum+x.score,0)/last.length:null}};
        });
        return {...gw,standings:sorted};
      });
    }
    const profileWinnings=new Map((data.winnings?.managers||[]).map(m=>[Number(m.managerId),m]));
    const managerProfiles=managers.map(m=>({managerId:m.managerId,managerName:m.managerName,teamName:m.teamName,preferredFormation:null,remainingChips:m.remainingChips||null,activeChip:m.activeChip||null,ratings:{},ratingChanges:{},stats:{transfers:standings.find(s=>s.managerId===m.managerId)?.transfersMade??null,transferReturn:null,goals:null,assists:null,cleanSheets:null},honours:{totalWinnings:profileWinnings.get(m.managerId)?.totalWinnings??null}}));
    const scoredRows=gameweeks.flatMap(g=>(g.standings||[]).filter(m=>!m.notStarted&&number(m.netPoints)!==null).map(m=>({...m,gameweek:g.gameweek})));
    const highestScore=scoredRows.slice().sort((a,b)=>b.netPoints-a.netPoints)[0]||{};
    const lowestScore=scoredRows.slice().sort((a,b)=>a.netPoints-b.netPoints)[0]||{};
    const seasonRecords={highestScore:{managerName:highestScore.managerName,gameweek:highestScore.gameweek,points:highestScore.netPoints},lowestScore:{managerName:lowestScore.managerName,gameweek:lowestScore.gameweek,points:lowestScore.netPoints},mostValuableTeam:{},bestTransfer:{},worstTransfer:{}};
    return {leagueKey:key,seasonKey:data.season.key,updated:data.dataUpdatedAt,
      notice:`${data.season.label||data.season.key}${data.season.isCurrent===false?' · Archived':''} · ${managers.every(m=>m.notStarted)?'This competition starts scoring at GW'+Math.min(...managers.map(m=>Number(m.startGw)))+'. ':''}${data.coverage.complete===false?'Some scores are incomplete. ':''}${history?'Gameweek history connected. ':'Full gameweek history is not connected yet. '}${data.capabilities?.squad===1?'Squads load when you open a manager card. ':'Squads are not connected yet. '}Season records update from the available gameweek history.`,
      gameweeks,monthly,
      overall:{headers:['Player','Points','unused','Weeks won','unused','Prize','Team','Manager ID'],rows:overallManagers.map(m=>[m.managerName,m.overallPoints??'–',null,null,null,null,m.teamName,m.managerId]),payouts:data.prizes.overall.payouts||[],complete:final,awards:final?data.overallFinal.awards||[]:[]},managerProfiles,seasonRecords};
  }
  root.LeagueAdapter={adapt};
  if(typeof module!=='undefined')module.exports={adapt};
})(typeof window!=='undefined'?window:globalThis);

