import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { accountDeletionRequestsTable as requests, auditLogsTable, db, usersTable, verifyPassword } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { sensitiveActionLimiter } from "../lib/rate-limit";
import { parsePagination } from "../lib/http";
import { removeDriverGeo } from "../lib/redis";
import { z } from "zod";

const router: IRouter = Router();
class DeletionError extends Error { constructor(public status: number, message: string) { super(message); } }
const safe = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, next: NextFunction) => {
  try { res.setHeader("Cache-Control", "no-store"); await handler(req,res); }
  catch (error) { if (error instanceof DeletionError) res.status(error.status).json({ error: error.message }); else next(error); }
};
function receipt(row: typeof requests.$inferSelect) {
  return { reference: row.id, status: row.status, requestedAt: row.requestedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null, retentionReason: row.retentionReason, retentionUntil: row.retentionUntil?.toISOString() ?? null };
}
const Create = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(256), confirm: z.literal(true) });

// Password verification also supports deactivated accounts. No account is
// disabled or erased merely by submitting a request.
router.post("/account-deletion/requests", sensitiveActionLimiter, safe(async (req,res) => {
  const body = Create.safeParse(req.body);
  if (!body.success) throw new DeletionError(400,"Enter your account email and password and confirm the deletion request.");
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email,body.data.email.toLowerCase()));
  if (!user || user.deletedAt || !(await verifyPassword(body.data.password,user.passwordHash))) throw new DeletionError(401,"The email or password is incorrect. Reset your password from the app if needed.");
  if (!["passenger","driver","driver_applicant"].includes(user.role)) throw new DeletionError(403,"Staff accounts must be handled by the project administrator.");
  const row = await db.transaction(async tx => {
    const [current] = await tx.select().from(usersTable).where(eq(usersTable.id,user.id)).for("update");
    if (!current || current.deletedAt || current.passwordHash !== user.passwordHash) throw new DeletionError(409,"Your account changed. Please retry with your current password.");
    const [prior] = await tx.select().from(requests).where(eq(requests.userId,user.id));
    if (prior) return prior;
    const [created] = await tx.insert(requests).values({userId:user.id}).returning();
    await tx.insert(auditLogsTable).values({actorUserId:user.id,action:"account_deletion.requested",metadata:{requestId:created!.id}});
    return created!;
  });
  res.status(201).json({request:receipt(row)});
}));

// The random reference is a private receipt capability. Never return account
// names, emails or IDs from this public status endpoint.
router.get("/account-deletion/requests/:id", safe(async (req,res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new DeletionError(400,"Invalid request reference.");
  const [row] = await db.select().from(requests).where(eq(requests.id,id.data));
  if (!row) throw new DeletionError(404,"Request not found.");
  res.json({request:receipt(row)});
}));

router.get("/account-deletion/requests",requireAuth,requireRole("admin"),safe(async (req,res) => {
  const status = z.enum(["pending","reviewing","completed"]).optional().safeParse(req.query.status);
  if (!status.success) throw new DeletionError(400,"Invalid status.");
  const {limit,offset} = parsePagination(req.query,{defaultLimit:50,maxLimit:100});
  const rows = await db.select({request:requests,name:usersTable.fullName,email:usersTable.email,role:usersTable.role}).from(requests).innerJoin(usersTable,eq(requests.userId,usersTable.id))
    .where(status.data ? eq(requests.status,status.data) : undefined).orderBy(desc(requests.requestedAt)).limit(limit).offset(offset);
  res.json({requests:rows.map(row=>({...receipt(row.request),name:row.name,email:row.request.status==="completed"?null:row.email,role:row.role})),limit,offset});
}));

const Review = z.object({action:z.enum(["review","complete"]),confirmDeletion:z.boolean().optional(),retentionReason:z.string().trim().min(20).max(1000).optional(),retentionUntil:z.string().datetime().optional()});
router.patch("/account-deletion/requests/:id",requireAuth,requireRole("admin"),safe(async (req,res) => {
  const id = z.string().uuid().safeParse(req.params.id), body = Review.safeParse(req.body);
  if (!id.success || !body.success) throw new DeletionError(400,"Choose a valid request and action. Retention explanations must contain at least 20 characters.");
  const actor = (req as AuthenticatedRequest).user;
  const result = await db.transaction(async tx => {
    const [request] = await tx.select().from(requests).where(eq(requests.id,id.data)).for("update");
    if (!request) throw new DeletionError(404,"Request not found.");
    if (request.status === "completed") return request;
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id,request.userId)).for("update");
    if (!user || !["passenger","driver","driver_applicant"].includes(user.role)) throw new DeletionError(409,"This account requires staff review outside the consumer deletion flow.");
    if (body.data.action === "review") {
      const [saved] = await tx.update(requests).set({status:"reviewing",reviewedBy:actor.id}).where(eq(requests.id,request.id)).returning();
      await tx.insert(auditLogsTable).values({actorUserId:actor.id,targetUserId:user.id,action:"account_deletion.reviewing",metadata:{requestId:request.id}});
      return saved!;
    }
    if (!body.data.confirmDeletion) throw new DeletionError(400,"Confirm permanent deletion before completing this request.");
    const uid = user.id;
    // Lock wallets as well as the account. Database insert guards prevent a
    // request already in flight from creating new personal records afterward.
    await tx.execute(sql`select id from fare_wallets where user_id=${uid} for update`);
    const {rows:[checks]} = await tx.execute<{active:boolean;balance:boolean;assigned:boolean;history:number}>(sql`select
      (exists(select 1 from trips where (passenger_id=${uid} or driver_id=${uid}) and status in ('requested','matched','accepted','arrived','in_progress','completing'))
       or exists(select 1 from fixed_loop_reservations where (passenger_id=${uid} or booked_by_id=${uid}) and status in ('confirmed','boarded'))
       or exists(select 1 from fixed_loop_runs r join loop_vehicles v on v.id=r.vehicle_id where v.driver_id=${uid} and r.status in ('boarding','on_route'))
       or exists(select 1 from pending_top_ups where user_id=${uid} and status='pending')) as active,
      exists(select 1 from fare_wallets where user_id=${uid} and balance<>0) as balance,
      exists(select 1 from fixed_loop_services s join loop_vehicles v on v.id=s.vehicle_id where v.driver_id=${uid} and s.enabled) as assigned,
      ((select count(*) from trips where passenger_id=${uid} or driver_id=${uid})+
       (select count(*) from fixed_loop_reservations where passenger_id=${uid} or booked_by_id=${uid})+
       (select count(*) from fare_transactions where user_id=${uid})+
       (select count(*) from pending_top_ups where user_id=${uid})+
       (select count(*) from incident_reports where reporter_id=${uid})+
       (select count(*) from vehicle_driver_assignments where driver_id=${uid}))::int as history`);
    if (checks!.active || checks!.balance) throw new DeletionError(409,"Resolve active trips/reservations, pending top-ups and any wallet balance before completing deletion. The request remains open.");
    if (checks!.assigned) throw new DeletionError(409,"Reassign or disable the driver's fixed-loop service before completing deletion.");
    const retaining = Number(checks!.history)>0 || !!body.data.retentionReason || !!body.data.retentionUntil;
    const until = body.data.retentionUntil ? new Date(body.data.retentionUntil) : null;
    if (retaining && (!body.data.retentionReason || !until || until.getTime()<=Date.now())) throw new DeletionError(400,"Operational records exist. Document the specific lawful retention reason and a future retention end date before completing deletion.");
    await tx.execute(sql`delete from device_push_tokens where user_id=${uid}`);
    await tx.execute(sql`delete from refresh_tokens where user_id=${uid}`);
    await tx.execute(sql`delete from password_reset_tokens where user_id=${uid}`);
    await tx.execute(sql`delete from app_feedback where reporter_id=${uid}`);
    await tx.execute(sql`delete from driver_location_points where driver_id=${uid}`);
    await tx.execute(sql`update vehicle_location_points set driver_id=null where driver_id=${uid}`);
    await tx.execute(sql`update trip_ratings set comment=null,tags='[]'::jsonb where rater_id=${uid} or ratee_id=${uid}`);
    await tx.execute(sql`delete from subscriptions where user_id=${uid}`);
    await tx.execute(sql`update driver_profiles set license_number=null,plate_number=null,vehicle_color=null,review_reason=null,is_on_shift=false,is_available=false,current_lat=null,current_lon=null,last_location_at=null,approval_status='revoked',updated_at=now() where user_id=${uid}`);
    await tx.execute(sql`update loop_vehicles set status='off_duty',current_lat=null,current_lon=null,updated_at=now() where driver_id=${uid}`);
    await tx.execute(sql`update vehicle_driver_assignments set unassigned_at=coalesce(unassigned_at,now()) where driver_id=${uid}`);
    await tx.execute(sql`update audit_logs set metadata=null where actor_user_id=${uid} or target_user_id=${uid}`);
    await tx.execute(sql`update gis_audit_events set metadata=null where actor_user_id=${uid}`);
    await tx.update(usersTable).set({email:`deleted-${uid}@deleted.invalid`,fullName:null,phone:null,avatarUrl:null,passwordHash:null,emailVerifiedAt:null,termsAcceptedAt:null,termsVersion:null,lastLoginAt:null,isActive:false,deletedAt:new Date(),updatedAt:new Date()}).where(eq(usersTable.id,uid));
    const [saved] = await tx.update(requests).set({status:"completed",completedAt:new Date(),reviewedBy:actor.id,retentionReason:retaining?body.data.retentionReason!:null,retentionUntil:retaining?until:null}).where(eq(requests.id,request.id)).returning();
    await tx.insert(auditLogsTable).values({actorUserId:actor.id,targetUserId:uid,action:"account_deletion.completed",metadata:{requestId:request.id,operationalRecordsRetained:retaining}});
    return saved!;
  });
  if (result.status === "completed") await removeDriverGeo(result.userId).catch(error=>req.log.warn({error},"Deleted account geo cleanup failed"));
  res.json({request:receipt(result)});
}));

export default router;
