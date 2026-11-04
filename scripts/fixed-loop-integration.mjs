import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// This suite changes run times to exercise departure rules. Never use the phone
// demo database or a real operator database. Seed a separate validation DB first.
const database = new URL(process.env.DATABASE_URL ?? '');
const origin = new URL(process.env.LOCAL_SMOKE_API_URL ?? 'http://127.0.0.1:5501');
const local = value => ['127.0.0.1', 'localhost', '[::1]'].includes(value);
if (process.env.LOCAL_FIXED_LOOP_TEST !== '1' || !local(database.hostname) ||
    !local(origin.hostname) || !/^\/move_apayao_validation_(suite_|ci)/.test(database.pathname)) {
  throw new Error('An explicitly opted-in, isolated local suite database is required.');
}
const require = createRequire(path.resolve('lib/db/package.json'));
const { Client } = require('pg');
const sql = new Client({ connectionString: database.href });
await sql.connect();
let passed = 0;
const check = label => { passed++; console.log(`PASS ${label}`); };
async function request(url, expected, actor, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(new URL(`/api${url}`, origin), {
    method, headers: { ...(actor ? { Authorization: `Bearer ${actor.accessToken}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000), redirect: 'error',
  });
  // Never echo authentication response bodies or credentials in test output.
  const result = await response.json();
  if (expected !== null) assert.equal(response.status, expected, `${method} ${url}: ${result.error ?? 'unexpected status'}`);
  return { status: response.status, ...result };
}
try {
  const credentials = JSON.parse(await readFile('local-secrets/fixed-loop-local-test.json', 'utf8'));
  async function login(account) {
    const auth = await request('/auth/login', 200, null, { identifier: account.email, password: account.password });
    const { rows } = await sql.query('select id from users where email=$1', [account.email]);
    assert.equal(auth.user.id, rows[0]?.id, 'API must point at the isolated suite database');
    return auth;
  }
  const operator = await login(credentials.operator), admin = await login(credentials.admin);
  const passengers = [];
  for (const account of credentials.passengers) passengers.push(await login(account));
  const [a,b,c,d,e,f] = passengers;
  const { service } = await request('/fixed-loop/service', 200, a);
  assert.equal(service.seatedCapacity,19); assert.equal(service.standingCapacity,10);
  assert.deepEqual(service.outboundStops.map(s=>s.key), ['pudtol_market','dagupan_gym','luna_nhs','capitol','asc']);
  assert.deepEqual(service.returnStops.map(s=>s.key), ['asc','tumog_nhs','dagupan_gym','pudtol_market']);
  check('directional stops and 19 seated / 10 standing capacity');
  const today = new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
  const date = new Date(Date.parse(`${today}T00:00:00Z`)+6*86400_000).toISOString().slice(0,10);
  const { runs } = await request(`/fixed-loop/runs?date=${date}`,200,a);
  assert.equal(runs.length,16);
  assert.equal(runs[0].direction,'to_pudtol');
  for (const run of runs) assert.equal(Date.parse(run.arrivalAt)-Date.parse(run.departureAt),1800_000);
  assert.equal((await request(`/fixed-loop/runs?date=${date}`,200,a)).runs.length,16);
  await request('/fixed-loop/runs?date=2099-01-01',400,a);
  await request('/fixed-loop/runs',401);
  check('daily 16-leg timetable, repeat reads, booking horizon and authentication');
  const reserve = (actor,run,seats,standing=[],pickupIndex=0,dropoffIndex=run.stops.length-1,key=randomUUID(),status=201) =>
    request('/fixed-loop/reservations',status,actor,{runId:run.id,pickupIndex,dropoffIndex,seats,standing,requestId:key});
  const availability = (run,pickup=0,drop=run.stops.length-1) => request(`/fixed-loop/runs/${run.id}/availability?pickupIndex=${pickup}&dropoffIndex=${drop}`,200,a);
  const cancel = (actor,ticket) => request(`/fixed-loop/reservations/${ticket.id}/cancel`,200,actor,{});
  const full = runs[0];
  const { reservation:bulk } = await reserve(a,full,Array.from({length:18},(_,i)=>i+1));
  const contenders = await Promise.all([reserve(b,full,[19],[],0,full.stops.length-1,randomUUID(),null),reserve(c,full,[19],[],0,full.stops.length-1,randomUUID(),null)]);
  assert.deepEqual(contenders.map(r=>r.status).sort(),[201,409]);
  assert.equal((await availability(full)).availableSeats.length,0);
  assert.equal((await availability(full)).availableStanding.length,10);
  await reserve(d,full,[],Array.from({length:10},(_,i)=>i+1));
  assert.equal((await availability(full)).availableStanding.length,0);
  await reserve(e,full,[1],[],0,1,randomUUID(),409);
  await reserve(e,full,[20],[],0,1,randomUUID(),400);
  await reserve(e,full,[],[11],0,1,randomUUID(),400);
  await reserve(e,full,[1,1],[],0,1,randomUUID(),400);
  await reserve(e,full,[],[],0,1,randomUUID(),400);
  check('concurrent last-seat race, independent standing capacity and invalid selections');
  const allocation = (await sql.query('select * from fixed_loop_places where reservation_id=$1 limit 1',[bulk.id])).rows[0];
  await assert.rejects(sql.query('insert into fixed_loop_places(reservation_id,run_id,place_type,place_number,segment) values($1,$2,$3,$4,$5)',[allocation.reservation_id,allocation.run_id,allocation.place_type,allocation.place_number,allocation.segment]), {code:'23505'});
  check('database rejects duplicate occupied seat segments');
  const segment = runs.find(r=>r.direction==='to_asc'), key=randomUUID();
  const { reservation:first } = await reserve(a,segment,[1],[],0,1,key);
  assert.equal((await reserve(a,segment,[1],[],0,1,key)).reservation.id,first.id);
  await reserve(a,segment,[2],[],0,1,key,409);
  await reserve(a,segment,[2],[],0,1,randomUUID(),409);
  const {reservation:later} = await reserve(b,segment,[1],[],1,2);
  await reserve(c,segment,[1],[],0,2,randomUUID(),409);
  await reserve(c,segment,[2],[],2,1,randomUUID(),400);
  await request(`/fixed-loop/reservations/${first.id}`,403,c);
  await request(`/fixed-loop/runs/${segment.id}/manifest`,403,c);
  await request(`/fixed-loop/runs/${segment.id}/control`,403,c,{action:'boarding'});
  await request(`/fixed-loop/runs/${segment.id}/walk-ins`,403,c,{dropoffIndex:1,seats:[3],requestId:randomUUID()});
  await cancel(a,first);
  assert.ok((await availability(segment,0,1)).availableSeats.includes(1));
  assert.ok(!(await availability(segment,1,2)).availableSeats.includes(1));
  assert.equal((await reserve(a,segment,[1],[],0,1,key)).reservation.status,'cancelled');
  await cancel(b,later);
  check('segment reuse, idempotency, cancellation and reservation privacy');
  // Create a distinct run in this disposable DB so tests work at any hour.
  const source = segment;
  const {rows:[active]} = await sql.query(`insert into fixed_loop_runs(service_id,vehicle_id,unit_label,service_date,direction,departure_at,arrival_at,stops)
    select service_id,vehicle_id,unit_label,$2,'to_asc',now()+interval '10 minutes',now()+interval '40 minutes',stops from fixed_loop_runs where id=$1 returning *`,[source.id,today]);
  const run={id:active.id,stops:active.stops};
  const {reservation:boardingA}=await reserve(a,run,[1],[],0,1);
  const {reservation:downstream}=await reserve(b,run,[1],[],1,run.stops.length-1);
  const {reservation:noShow}=await reserve(c,run,[2]);
  const control=(action,expectedStopIndex,extra={})=>request(`/fixed-loop/runs/${run.id}/control`,200,operator,{action,expectedStopIndex,...extra});
  const board=(ticket,status=200)=>request(`/fixed-loop/reservations/${ticket.id}/check-in`,status,operator,{action:'board'});
  await control('boarding');
  await request(`/fixed-loop/runs/${run.id}/control`,409,operator,{action:'start'});
  await request(`/fixed-loop/reservations/${noShow.id}/check-in`,409,operator,{action:'no_show'});
  await board(boardingA); await board(downstream,409);
  assert.ok(!(await availability(run,0,1)).availableSeats.includes(1));
  await sql.query("update fixed_loop_runs set departure_at=now()-interval '1 minute' where id=$1",[run.id]);
  await control('start');
  await request(`/fixed-loop/runs/${run.id}/control`,409,operator,{action:'next_stop',expectedStopIndex:0});
  await request(`/fixed-loop/reservations/${noShow.id}/check-in`,200,operator,{action:'no_show'});
  await request(`/fixed-loop/runs/${run.id}/walk-ins`,409,operator,{dropoffIndex:run.stops.length-1,seats:[1],requestId:randomUUID()});
  const {reservation:walkIn}=await request(`/fixed-loop/runs/${run.id}/walk-ins`,201,operator,{dropoffIndex:run.stops.length-1,seats:[2],requestId:randomUUID()});
  assert.equal(walkIn.status,'boarded');
  assert.ok(!(await availability(run)).availableSeats.includes(2));
  await request(`/fixed-loop/runs/${run.id}/control`,409,operator,{action:'cancel'});
  await control('next_stop',0);
  assert.equal((await request(`/fixed-loop/reservations/${boardingA.id}`,200,a)).reservation.status,'completed');
  assert.ok(!(await availability(run,1,2)).availableSeats.includes(1));
  await request(`/fixed-loop/runs/${run.id}/control`,409,operator,{action:'next_stop',expectedStopIndex:0});
  await board(downstream);
  for(let index=1;index<run.stops.length-1;index++) await control('next_stop',index);
  const manifest=await request(`/fixed-loop/runs/${run.id}/manifest`,200,operator);
  assert.equal(manifest.run.status,'completed');
  assert.ok(manifest.reservations.filter(r=>r.status!=='no_show').every(r=>r.status==='completed'));
  assert.equal((await availability(run)).availableSeats.length,19);
  await reserve(f,run,[3],[],0,1,randomUUID(),409);
  check('driver boarding, departure cutoff, no-shows, walk-ins, explicit alighting and retry-safe stop changes');
  await request('/drivers/location',200,operator,{lat:18.33,lon:121.37},'PUT');
  await request('/drivers/availability',200,operator,{isAvailable:true},'PUT');
  const {rows:[driver]}=await sql.query('select is_on_shift,is_available from driver_profiles where user_id=$1',[operator.user.id]);
  assert.equal(driver.is_on_shift,true); assert.equal(driver.is_available,false);
  assert.ok((await request('/fixed-loop/service',200,a)).service.location);
  await sql.query("update driver_profiles set last_location_at=now()-interval '5 minutes' where user_id=$1",[operator.user.id]);
  assert.equal((await request('/fixed-loop/service',200,a)).service.location,null);
  await request('/drivers/availability',200,operator,{isAvailable:false},'PUT');
  assert.equal((await request('/fixed-loop/service',200,a)).service.location,null);
  check('fresh GPS requires an active shift and fixed-loop operator stays out of on-demand dispatch');
  await request('/feedback',401,null,{category:'bug',message:'A local validation message'});
  await request('/feedback',400,f,{category:'bug',message:'   '});
  await request('/feedback',400,f,{category:'bug',message:'x'.repeat(2001)});
  await request('/feedback',400,f,{category:'bug',message:'😀'.repeat(2001)});
  const {feedback}=await request('/feedback',201,f,{category:'bug',message:'Local validation: the booking screen needs checking.',platform:'android',appVersion:'test'});
  await request('/feedback',403,f);
  await request(`/feedback/${feedback.id}`,403,f,{status:'resolved'},'PATCH');
  await request(`/feedback/${feedback.id}`,200,admin,{status:'reviewing'},'PATCH');
  await request(`/feedback/${feedback.id}`,200,admin,{status:'resolved'},'PATCH');
  assert.ok((await request('/feedback?status=resolved',200,admin)).feedback.some(item=>item.id===feedback.id));
  check('feedback validation, restricted admin inbox and resolution');
  console.log(`${passed} fixed-loop integration groups passed.`);
} finally { await sql.end(); }
