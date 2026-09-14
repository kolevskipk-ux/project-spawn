// Keep bounded diagnostic history. Uncertain observations never replace a verified state.
export function appendObservation(history,retailer,record){
 const key=`${retailer}:${record.itemId}`,previous=history[key]||{};
 const verified=['available','sold_out'].includes(record.state);
 return {...history,[key]:{latest:record,lastVerified:verified?record:previous.lastVerified||null,checks:[record,...previous.checks||[]].slice(0,48)}};
}
