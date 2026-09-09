export interface CategoryReference {product_type:string;language:string;revision:number;amount_mxn:number;source_type:string;approved_at:string}
export function referenceCategory(title:string,language:string):string|null {
  if(language.toLowerCase()!=='english')return null;
  const text=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/pokemon center|exclusive|exclusiv|super[ -]*premium|premium poster|deluxe|\bcase\b|display|\blot\b|multipack|opened|empty|\d+\s*[x×]|[x×]\s*\d+|(?:set|pack) of \d/.test(text))return null;
  if(/ultra[ -]*premium|\bupc\b/.test(text))return 'ultra_premium_collection';
  if(/premium collection/.test(text))return 'premium_collection';
  if(/binder collection/.test(text))return 'binder_collection';
  if(/poster collection/.test(text))return 'poster_collection';
  if(/elite trainer box|\betb\b/.test(text))return 'elite_trainer_box';
  if(/booster bundle/.test(text)&&!/(?:\b[1-57-9]|\b\d{2,})[ -]*(?:packs?|boosters?|sobres?)/.test(text))return 'booster_bundle';
  if(/(?:three|3)[ -]*(?:booster|pack)(?:[ -]*blister)?|three booster blister/.test(text))return 'three_booster_blister';
  return null;
}
export function categoryReference(title:string,language:string,refs:CategoryReference[]) {
  const category=referenceCategory(title,language);
  return refs.filter(r=>r.product_type===category&&r.language===language.toLowerCase()).sort((a,b)=>b.revision-a.revision)[0]??null;
}
