import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const database=new URL(process.env.DATABASE_URL??''),origin=new URL(process.env.LOCAL_SMOKE_API_URL??'http://127.0.0.1:5501');
const local=h=>['localhost','127.0.0.1','[::1]'].includes(h);
if(process.env.LOCAL_FIXED_LOOP_TEST!=='1'||!local(database.hostname)||!local(origin.hostname)||!/^\/move_apayao_validation_(suite_|ci)/.test(database.pathname))throw Error('Only an opted-in isolated suite database may run destructive deletion tests.');
const require=createRequire(path.resolve('lib/db/package.json'));const {Client}=require('pg');const db=new Client({connectionString:database.href});await db.connect();
let passed=0;const check=name=>{passed++;console.log('PASS '+name);};
async function api(url,status,actor,body,method=body===undefined?'GET':'POST'){
 for(let attempt=0;attempt<3;attempt++) {
  const response=await fetch(new URL('/api'+url,origin),{method,headers:{...(actor?{Authorization:'Bearer '+actor.accessToken}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
  const text=await response.text();
  if(response.status===429&&attempt<2){const seconds=Number(response.headers.get('retry-after')??61);assert.ok(seconds>0&&seconds<=61,'Unexpected rate-limit window');console.log('Respecting the local sensitive-action rate-limit window.');await new Promise(resolve=>setTimeout(resolve,seconds*1000+200));continue;}
  let data=null;try{data=text?JSON.parse(text):null;}catch{throw Error(method+' '+url+' returned non-JSON HTTP '+response.status);}
  assert.equal(response.status,status,method+' '+url+': '+(data?.error??'unexpected HTTP status'));return data;
 }
 throw Error('Local API retry limit reached');
}
try {
 const credentials=JSON.parse(fs.readFileSync('local-secrets/fixed-loop-local-test.json','utf8'));
 async function login(account){const auth=await api('/auth/login',200,null,{identifier:account.email,password:account.password});const {rows:[row]}=await db.query('select id from users where email=$1',[account.email]);assert.equal(auth.user.id,row?.id,'API must use the disposable suite database');return auth;}
 const admin=await login(credentials.admin),operator=await login(credentials.operator);
 const normal=credentials.passengers[5],retained=credentials.passengers[4];
 const passenger=await login(normal),second=await login(retained);
 const request=(account,status=201)=>api('/account-deletion/requests',status,null,{email:account.email,password:account.password,confirm:true});
 await api('/account-deletion/requests',400,null,{email:normal.email,password:normal.password});
 await request({...normal,password:'incorrect-test-password'},401);
 await request({...normal,email:'missing-account@example.test'},401);
 await request(credentials.admin,403);
 const {request:ticket}=await request(normal);
 assert.equal((await request(normal)).request.reference,ticket.reference);
 assert.equal((await api('/auth/profile',200,passenger)).user.isActive,true);
 const receipt=(await api('/account-deletion/requests/'+ticket.reference,200)).request;
 assert.deepEqual(Object.keys(receipt).sort(),['reference','status','requestedAt','completedAt','retentionReason','retentionUntil'].sort());
 await api('/account-deletion/requests/not-a-uuid',400);
 await api('/account-deletion/requests/'+randomUUID(),404);
 await api('/account-deletion/requests',401);
 await api('/account-deletion/requests',403,passenger);
 await api('/account-deletion/requests/'+ticket.reference,403,passenger,{action:'complete',confirmDeletion:true},'PATCH');
 check('owner verification, idempotent requests, private receipts and administrator access');
 const review=(id,body,status=200)=>api('/account-deletion/requests/'+id,status,admin,body,'PATCH');
 assert.equal((await review(ticket.reference,{action:'review'})).request.status,'reviewing');
 await review(ticket.reference,{action:'complete'},400);
 await db.query('insert into device_push_tokens(user_id,token,platform,app) values($1,$2,$3,$4)',[passenger.user.id,'ExponentPushToken[isolated-deletion-test]','android','passenger']);
 await db.query("insert into password_reset_tokens(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')",[passenger.user.id,randomUUID()]);
 // Deactivated users must still be able to request deletion with their password.
 await db.query('update users set is_active=false where id=$1',[passenger.user.id]);
 assert.equal((await request(normal)).request.reference,ticket.reference);
 const completed=(await review(ticket.reference,{action:'complete',confirmDeletion:true})).request;
 assert.equal(completed.status,'completed');assert.equal(completed.retentionReason,null);
 const {rows:[erased]}=await db.query('select * from users where id=$1',[passenger.user.id]);
 assert.ok(erased.deleted_at);assert.equal(erased.is_active,false);assert.equal(erased.password_hash,null);assert.equal(erased.full_name,null);assert.equal(erased.phone,null);assert.equal(erased.avatar_url,null);assert.notEqual(erased.email,normal.email);
 for(const [table,column]of [['device_push_tokens','user_id'],['password_reset_tokens','user_id'],['refresh_tokens','user_id'],['app_feedback','reporter_id']])assert.equal(Number((await db.query(`select count(*) from ${table} where ${column}=$1`,[passenger.user.id])).rows[0].count),0);
 await api('/auth/profile',401,passenger);
 await api('/auth/login',401,null,{identifier:normal.email,password:normal.password});
 await api('/auth/refresh',401,null,{refreshToken:passenger.refreshToken});
 assert.equal((await review(ticket.reference,{action:'complete',confirmDeletion:true})).request.status,'completed');
 assert.equal((await api('/account-deletion/requests/'+ticket.reference,200)).request.status,'completed');
 check('permanent credential/profile deletion, token/feedback purge, inactive-account access and safe retries');
 await assert.rejects(db.query('update users set is_active=true where id=$1',[passenger.user.id]),{code:'23514'});
 await assert.rejects(db.query("insert into app_feedback(reporter_id,category,message) values($1,'bug','late in-flight private message')",[passenger.user.id]),{code:'23514'});
 await assert.rejects(db.query('insert into device_push_tokens(user_id,token,platform,app) values($1,$2,$3,$4)',[passenger.user.id,'late-token','android','passenger']),{code:'23514'});
 check('database blocks reactivation and new personal records for deleted accounts');
 const {request:history}=await request(retained);
 await db.query('update fare_wallets set balance=5 where user_id=$1',[second.user.id]);
 await review(history.reference,{action:'complete',confirmDeletion:true},409);
 await db.query('update fare_wallets set balance=0 where user_id=$1',[second.user.id]);
 const providerRef='deletion-suite-'+randomUUID();
 await db.query("insert into pending_top_ups(user_id,amount,status,provider_ref) values($1,1,'pending',$2)",[second.user.id,providerRef]);
 await review(history.reference,{action:'complete',confirmDeletion:true},409);
 await db.query("update pending_top_ups set status='failed' where provider_ref=$1",[providerRef]);
 await review(history.reference,{action:'complete',confirmDeletion:true},400);
 const reason='Isolated suite financial record: retained for a documented audit review.';
 await review(history.reference,{action:'complete',confirmDeletion:true,retentionReason:reason,retentionUntil:'2000-01-01T00:00:00.000Z'},400);
 const until=new Date(Date.now()+86400_000).toISOString();
 const retainedReceipt=(await review(history.reference,{action:'complete',confirmDeletion:true,retentionReason:reason,retentionUntil:until})).request;
 assert.equal(retainedReceipt.retentionReason,reason);assert.equal(retainedReceipt.retentionUntil,until);
 assert.equal(Number((await db.query('select count(*) from pending_top_ups where provider_ref=$1',[providerRef])).rows[0].count),1);
 await api('/auth/profile',401,second);
 check('balance/payment holds and mandatory, dated explanations for retained records');
 const {request:driverRequest}=await request(credentials.operator);
 await review(driverRequest.reference,{action:'complete',confirmDeletion:true,retentionReason:reason,retentionUntil:until},409);
 await db.query("update fixed_loop_services set enabled=false where key='pudtol-luna'");
 const {rows:[activeRun]}=await db.query("insert into fixed_loop_runs(service_id,vehicle_id,unit_label,service_date,direction,departure_at,arrival_at,stops,status) select id,vehicle_id,unit_label,current_date,'to_asc',now()+interval '13 minutes',now()+interval '43 minutes',outbound_stops,'boarding' from fixed_loop_services where key='pudtol-luna' returning id");
 await review(driverRequest.reference,{action:'complete',confirmDeletion:true,retentionReason:reason,retentionUntil:until},409);
 await db.query('delete from fixed_loop_runs where id=$1',[activeRun.id]);
 await db.query("update fixed_loop_services set enabled=true where key='pudtol-luna'");
 assert.equal((await api('/auth/profile',200,operator)).user.isActive,true);
 check('assigned live pilot driver is protected until service reassignment/disablement');
 const list=await api('/account-deletion/requests?status=completed',200,admin);
 assert.ok(list.requests.some(r=>r.reference===ticket.reference&&r.email===null&&r.name===null));
 check('admin queue reflects completed requests without retained contact details');
 console.log(passed+' account-deletion integration groups passed.');
} finally {await db.end();}
