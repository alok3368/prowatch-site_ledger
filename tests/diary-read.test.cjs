const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readDiary}=require('../diary-read');
const data={sites:[],days:[]};
const ok=()=>({ok:true,json:async()=>data});
const bad=status=>({ok:false,status});
for (const status of [502,503,504]) test(`${status} then success retries once`,async()=>{
 let n=0,wait=0;assert.deepEqual(await readDiary('https://example.invalid','test',{fetchImpl:async()=>++n===1?bad(status):ok(),sleep:async ms=>{wait=ms}}),data);assert.equal(n,2);assert.equal(wait,5000);
});
test('warm success is one call',async()=>{let n=0;await readDiary('x','k',{fetchImpl:async()=>{n++;return ok()}});assert.equal(n,1)});
test('persistent 502 fails after two calls',async()=>{let n=0;await assert.rejects(readDiary('x','k',{fetchImpl:async()=>{n++;return bad(502)},sleep:async()=>{}}),/diary http 502/);assert.equal(n,2)});
for(const status of [401,403,404,500]) test(`${status} not retried`,async()=>{let n=0;await assert.rejects(readDiary('x','k',{fetchImpl:async()=>{n++;return bad(status)}}));assert.equal(n,1)});
for(const name of ['TypeError','TimeoutError','AbortError']) test(`${name} then success retries`,async()=>{let n=0;await readDiary('x','k',{fetchImpl:async()=>{if(++n===1){const e=new Error('network');e.name=name;throw e}return ok()},sleep:async()=>{}});assert.equal(n,2)});
for(const payload of [{},null,{sites:[],days:null}]) test('invalid payload fails closed',async()=>{let n=0;await assert.rejects(readDiary('x','k',{fetchImpl:async()=>{n++;return {ok:true,json:async()=>payload}}}),/invalid response/);assert.equal(n,1)});
test('missing key makes no request',async()=>{await assert.rejects(readDiary('x','',{fetchImpl:()=>{throw Error('must not call')}}),/INTERNAL_KEY not set/)});
