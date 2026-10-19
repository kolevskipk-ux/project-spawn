// executeScript cannot be cancelled. Stop awaiting it; late results never enter history.
export async function withDeadline(promise,ms,label){
  let timer;
  try{
    return await Promise.race([promise,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(`${label} timed out`)),ms);
    })]);
  }finally{clearTimeout(timer);}
}
