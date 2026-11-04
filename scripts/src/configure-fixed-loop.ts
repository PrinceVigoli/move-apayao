import path from "node:path";
import {fileURLToPath} from "node:url";
import {isDeepStrictEqual} from "node:util";
import dotenv from "dotenv";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
dotenv.config({path:path.join(root,"artifacts/api-server/.env.local")});
dotenv.config({path:path.join(root,"artifacts/api-server/.env")});

async function main(){
  if(process.env.FIXED_LOOP_CONFIGURE!=="1"||!process.env.DATABASE_URL)throw Error("Explicit FIXED_LOOP_CONFIGURE=1 and DATABASE_URL are required.");
  const {db,usersTable,driverProfilesTable,loopRoutesTable,loopVehiclesTable,fixedLoopServicesTable,auditLogsTable}=await import("@workspace/db");
  const {and,eq}=await import("drizzle-orm");
  const email="fixedloop.pudtol-luna@moveapayao.test";
  const [operator]=await db.select({user:usersTable,profile:driverProfilesTable}).from(usersTable).innerJoin(driverProfilesTable,eq(driverProfilesTable.userId,usersTable.id)).where(eq(usersTable.email,email));
  if(!operator||operator.user.role!=="driver"||!operator.user.isActive||operator.user.deletedAt||operator.profile.approvalStatus!=="approved")throw Error("An active approved dedicated driver account must be provisioned first.");
  if(operator.profile.capacity!==29)throw Error("The pilot operator's vehicle capacity must be 29 total places.");
  const market={key:"pudtol_market",name:"Pudtol Public Market"};
  const dagupan={key:"dagupan_gym",name:"Dagupan Gym, Luna, Apayao"};
  const school={key:"luna_nhs",name:"Luna National High School, Luna, Apayao"};
  const capitol={key:"capitol",name:"Apayao Provincial Capitol, San Isidro Sur, Luna, Apayao",lat:18.3311841,lon:121.372348};
  const asc={key:"asc",name:"Apayao State College, Luna, Apayao",lat:18.3321469,lon:121.3779476};
  const tumog={key:"tumog_nhs",name:"Tumog National High School, Luna, Apayao"};
  const outbound=[market,dagupan,school,capitol,asc],returnStops=[asc,tumog,dagupan,market];
  await db.transaction(async tx=>{
    const [existing]=await tx.select().from(fixedLoopServicesTable).where(eq(fixedLoopServicesTable.key,"pudtol-luna"));
    if(existing){
      const [vehicle]=await tx.select().from(loopVehiclesTable).where(and(eq(loopVehiclesTable.id,existing.vehicleId),eq(loopVehiclesTable.driverId,operator.user.id)));
      if(!vehicle||!isDeepStrictEqual(existing.outboundStops,outbound)||!isDeepStrictEqual(existing.returnStops,returnStops))throw Error("An existing service differs from the confirmed pilot; no assignment or stops were changed.");
      console.log("Confirmed pilot service already configured; no operational state or location was changed.");return;
    }
    if(operator.profile.isOnShift)throw Error("Dedicated operator must be off duty for initial configuration.");
    const name="Pudtol–Luna Fixed Loop";
    const [priorRoute]=await tx.select().from(loopRoutesTable).where(eq(loopRoutesTable.name,name));
    const route=priorRoute??(await tx.insert(loopRoutesTable).values({name,description:"Pudtol to ASC via Payanan Road; return via Tumog and the national highway. Daily scheduled pilot service."}).returning())[0]!;
    if(!route.isActive)throw Error("The pilot route has been disabled; no service was enabled.");
    const [priorVehicle]=await tx.select().from(loopVehiclesTable).where(eq(loopVehiclesTable.driverId,operator.user.id));
    if(priorVehicle&&priorVehicle.routeId!==route.id)throw Error("The dedicated driver is assigned to another route; no reassignment was made.");
    if(priorVehicle?.status==="on_route")throw Error("The vehicle is currently on route; initial configuration was stopped.");
    const vehicle=priorVehicle??(await tx.insert(loopVehiclesTable).values({routeId:route.id,driverId:operator.user.id,status:"off_duty"}).returning())[0]!;
    const [service]=await tx.insert(fixedLoopServicesTable).values({key:"pudtol-luna",name,vehicleId:vehicle.id,unitLabel:"Pudtol–Luna E-jeep · Unit 01",enabled:true,outboundStops:outbound,returnStops}).returning();
    await tx.insert(auditLogsTable).values({actorUserId:operator.user.id,action:"fixed_loop.pilot_configured",metadata:{serviceId:service!.id,vehicleId:vehicle.id,provisioningScript:"configure-fixed-loop",seated:19,standing:10}});
    console.log("Configured the confirmed directional pilot with 19 seats, 10 standing places and daily half-hour departure legs.");
    console.log("The dedicated vehicle remains off duty. No GPS location, stop pin or physical movement was fabricated.");
  });
}
main().then(()=>process.exit(0)).catch((error:unknown)=>{console.error(error instanceof Error?error.message:"Pilot configuration failed");process.exit(1);});
