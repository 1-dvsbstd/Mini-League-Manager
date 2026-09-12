(function(root){
  function validate(payload, identity){
    if(payload?.ok!==true)throw new Error(({NOT_STARTED:'This competition has not started for this manager.',SQUAD_NOT_RELEASED:'This gameweek’s squad is not available yet.',ARCHIVED_SQUAD_UNAVAILABLE:'Squads for this archived season are not stored yet.'})[payload?.code]||'Squad unavailable. Close and reopen this card to retry.');
    if(payload.schemaVersion!==1||['leagueKey','seasonKey','managerId','gameweek'].some(k=>payload[k]!==identity[k])||!Array.isArray(payload.players)||payload.players.length!==15)throw new Error('Squad identity could not be verified.');
    const ids=new Set(),slots=new Set();
    const numeric=v=>v===null||typeof v==='number'&&Number.isFinite(v);
    for(const p of payload.players){
      if(!Number.isInteger(p.id)||p.id<1||ids.has(p.id)||!Number.isInteger(p.squadPosition)||p.squadPosition<1||p.squadPosition>15||slots.has(p.squadPosition)||![1,2,3,4].includes(p.position)||!Number.isInteger(p.multiplier)||p.multiplier<0||p.multiplier>3||!numeric(p.rawPoints)||!numeric(p.points)||!Array.isArray(p.breakdown)||p.breakdown.some(r=>typeof r.label!=='string'||!numeric(r.value)||!numeric(r.points)))throw new Error('Squad data is incomplete.');
      if(p.rawPoints!==null&&p.points!==p.rawPoints*p.multiplier)throw new Error('Squad points could not be verified.');
      ids.add(p.id);slots.add(p.squadPosition);
    }
    return payload;
  }
  root.LeagueSquad={validate};
  if(typeof module!=='undefined')module.exports={validate};
})(typeof window!=='undefined'?window:globalThis);

