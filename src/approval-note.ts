export function approvalNote(value:unknown,action:string):string {
  return String(value??'').trim().slice(0,500)||`Administrator decision: ${action}. No optional comment provided.`;
}
