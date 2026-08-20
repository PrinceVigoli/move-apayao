import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  getListDriverApplicationsQueryKey,
  useListDriverApplications,
  useUpdateDriverApproval,
  type DriverApplication,
} from "@workspace/api-client-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"
import { useLiveDrivers, formatLastSeen, type FleetDriverStatus } from "@/lib/fleet"
import {
  Check,
  Ban,
  ClipboardCheck,
  Clock3,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  UserRoundCheck,
  X,
} from "lucide-react"
import { Link } from "wouter"

const STATUS_BADGE: Record<FleetDriverStatus, { label: string; className: string }> = {
  available: {
    label: "Available",
    className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  },
  on_trip: { label: "On Trip", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  offline: { label: "Offline", className: "bg-gray-100 text-gray-600 hover:bg-gray-100" },
}

type ApplicationStatus = "pending" | "approved" | "rejected" | "revoked"
type ApplicationFilter = "all" | ApplicationStatus

const APPLICATION_BADGE: Record<ApplicationStatus, { label: string; className: string }> = {
  pending: {
    label: "Pending review",
    className: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  },
  approved: {
    label: "Approved",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  },
  rejected: {
    label: "Rejected",
    className: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50",
  },
  revoked: {
    label: "Access revoked",
    className: "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-100",
  },
}

function initials(name: string | null | undefined) {
  return (name ?? "Driver")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

function ReviewButtons({
  application,
  onReview,
  disabled,
}: {
  application: DriverApplication
  onReview: (
    application: DriverApplication,
    status: "approved" | "rejected" | "revoked",
  ) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(application.approvalStatus === "pending" ||
        application.approvalStatus === "rejected" ||
        application.approvalStatus === "revoked") && (
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={() => onReview(application, "approved")}
          disabled={disabled || !application.isActive}
        >
          <Check className="h-4 w-4" />
          {application.approvalStatus === "revoked" ? "Restore access" : "Approve"}
        </Button>
      )}
      {application.approvalStatus === "pending" && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
          onClick={() => onReview(application, "rejected")}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
          Reject
        </Button>
      )}
      {application.approvalStatus === "approved" && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          onClick={() => onReview(application, "revoked")}
          disabled={disabled}
        >
          <Ban className="h-4 w-4" />
          Revoke access
        </Button>
      )}
    </div>
  )
}

export default function Drivers() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("fleet")
  const [search, setSearch] = useState("")
  const [applicationFilter, setApplicationFilter] = useState<ApplicationFilter>("pending")
  const [reviewAction, setReviewAction] = useState<{
    application: DriverApplication
    status: "approved" | "rejected" | "revoked"
  } | null>(null)
  const [reviewReason, setReviewReason] = useState("")

  const {
    data: fleetData,
    isLoading: isFleetLoading,
    isError: isFleetError,
  } = useLiveDrivers({ pollMs: 15000 })
  const {
    data: applicationData,
    isLoading: areApplicationsLoading,
    isError: areApplicationsError,
    refetch: refetchApplications,
  } = useListDriverApplications({
    query: {
      queryKey: getListDriverApplicationsQueryKey(),
      refetchInterval: 30000,
    },
  })

  const approvalMutation = useUpdateDriverApproval({
    mutation: {
      onSuccess: async (_, variables) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListDriverApplicationsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: ["admin-drivers-live"] }),
          queryClient.invalidateQueries({ queryKey: ["audit-logs"] }),
        ])
        toast({
          title:
            variables.data.status === "approved"
              ? "Driver access granted"
              : variables.data.status === "revoked"
                ? "Driver access revoked"
                : "Application rejected",
          description:
            variables.data.status === "approved"
              ? "The applicant can now sign in as a driver."
              : "The reason and administrator were recorded in Audit Logs.",
        })
      },
      onError: (error) => {
        toast({
          title: "Could not update application",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        })
      },
    },
  })

  const drivers = fleetData?.drivers ?? []
  const applications = applicationData?.applications ?? []
  const counts = applicationData?.counts ?? { pending: 0, approved: 0, rejected: 0, revoked: 0 }
  const q = search.trim().toLowerCase()

  const filteredDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          !q ||
          (driver.fullName ?? "").toLowerCase().includes(q) ||
          (driver.phone ?? "").toLowerCase().includes(q) ||
          (driver.plateNumber ?? "").toLowerCase().includes(q) ||
          driver.vehicleType.toLowerCase().includes(q),
      ),
    [drivers, q],
  )

  const filteredApplications = useMemo(
    () =>
      applications.filter((application) => {
        const matchesStatus =
          applicationFilter === "all" || application.approvalStatus === applicationFilter
        const matchesSearch =
          !q ||
          (application.fullName ?? "").toLowerCase().includes(q) ||
          application.email.toLowerCase().includes(q) ||
          (application.phone ?? "").toLowerCase().includes(q) ||
          (application.plateNumber ?? "").toLowerCase().includes(q) ||
          (application.licenseNumber ?? "").toLowerCase().includes(q)
        return matchesStatus && matchesSearch
      }),
    [applicationFilter, applications, q],
  )

  const beginReview = (
    application: DriverApplication,
    status: "approved" | "rejected" | "revoked",
  ) => {
    setReviewReason("")
    setReviewAction({ application, status })
  }

  const confirmReview = () => {
    if (!reviewAction) return
    approvalMutation.mutate({
      id: reviewAction.application.userId,
      data: {
        status: reviewAction.status,
        reason: reviewAction.status === "approved" ? undefined : reviewReason.trim(),
      },
    })
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Driver management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review applications and monitor approved drivers from one place.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={activeTab === "fleet" ? "Search drivers..." : "Search applications..."}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:w-auto">
          <TabsTrigger value="fleet" className="gap-2">
            <UserRoundCheck className="h-4 w-4" />
            Approved drivers
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[11px]">
              {drivers.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Applications
            {counts.pending > 0 && (
              <Badge className="ml-1 bg-amber-500 px-1.5 py-0 text-[11px] text-white hover:bg-amber-500">
                {counts.pending}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fleet">
          <Card>
            <CardHeader className="flex-row items-center justify-between border-b py-4">
              <div>
                <p className="font-semibold">Approved driver fleet</p>
                <p className="text-xs text-muted-foreground">
                  Only approved accounts are shown here. {" "}
                  <Link href="/fleet" className="text-primary underline-offset-2 hover:underline">
                    View on map
                  </Link>
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isFleetLoading ? (
                <div className="space-y-3 p-6">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : isFleetError ? (
                <p className="px-6 py-12 text-center text-sm text-destructive">
                  Could not load the approved drivers.
                </p>
              ) : filteredDrivers.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                  {drivers.length === 0 ? "No approved drivers yet." : "No drivers match your search."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Driver</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Plate</TableHead>
                        <TableHead className="text-center">Seats</TableHead>
                        <TableHead className="text-center">Rating</TableHead>
                        <TableHead className="text-center">Trips</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDrivers.map((driver) => {
                        const badge = STATUS_BADGE[driver.status]
                        return (
                          <TableRow key={driver.userId}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback>{initials(driver.fullName)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-medium">{driver.fullName ?? "Driver"}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {driver.phone ?? "No phone"}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="capitalize">{driver.vehicleType}</TableCell>
                            <TableCell>{driver.plateNumber ?? "-"}</TableCell>
                            <TableCell className="text-center">{driver.capacity}</TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex items-center gap-1">
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                {driver.rating.toFixed(1)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">{driver.totalTrips}</TableCell>
                            <TableCell>
                              <Badge className={badge.className} variant="secondary">
                                {badge.label}
                              </Badge>
                              {driver.activeTrip && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Trip #{driver.activeTrip.id}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5" />
                                {formatLastSeen(driver.lastSeenSecondsAgo)}
                              </span>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {driver.locationSource === "iot_gps"
                                  ? "Vehicle IoT GPS"
                                  : driver.locationSource === "smartphone_gps"
                                    ? "Driver phone GPS"
                                    : "No GPS data"}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-amber-200 bg-amber-50/40">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Pending</p>
                  <p className="mt-1 text-2xl font-bold">{counts.pending}</p>
                </div>
                <Clock3 className="h-7 w-7 text-amber-500" />
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Approved</p>
                  <p className="mt-1 text-2xl font-bold">{counts.approved}</p>
                </div>
                <ShieldCheck className="h-7 w-7 text-emerald-500" />
              </CardContent>
            </Card>
            <Card className="border-rose-200 bg-rose-50/40">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-rose-700">Rejected</p>
                  <p className="mt-1 text-2xl font-bold">{counts.rejected}</p>
                </div>
                <X className="h-7 w-7 text-rose-500" />
              </CardContent>
            </Card>
            <Card className="border-slate-300 bg-slate-50/60">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-700">Revoked</p>
                  <p className="mt-1 text-2xl font-bold">{counts.revoked}</p>
                </div>
                <Ban className="h-7 w-7 text-slate-500" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b py-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold">Application review</p>
                  <p className="text-xs text-muted-foreground">
                    Verify licence and vehicle details before granting driver access.
                  </p>
                </div>
                <Select
                  value={applicationFilter}
                  onValueChange={(value) => setApplicationFilter(value as ApplicationFilter)}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="revoked">Access revoked</SelectItem>
                    <SelectItem value="all">All applications</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {areApplicationsLoading ? (
                <div className="space-y-3 p-6">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ) : areApplicationsError ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-destructive">Could not load driver applications.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchApplications()}>
                    Try again
                  </Button>
                </div>
              ) : filteredApplications.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <ClipboardCheck className="mx-auto h-9 w-9 text-muted-foreground/50" />
                  <p className="mt-3 font-medium">
                    {applicationFilter === "pending" ? "No applications waiting" : "No applications found"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {applications.length === 0
                      ? "New driver applications will appear here."
                      : "Try another status or search term."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 p-4 lg:hidden">
                    {filteredApplications.map((application) => {
                      const badge = APPLICATION_BADGE[application.approvalStatus]
                      return (
                        <div key={application.userId} className="rounded-xl border bg-card p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback>{initials(application.fullName)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{application.fullName ?? "Unnamed applicant"}</p>
                                <p className="truncate text-xs text-muted-foreground">{application.email}</p>
                              </div>
                            </div>
                            <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                          </div>
                          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            <div><dt className="text-xs text-muted-foreground">Vehicle</dt><dd className="capitalize">{application.vehicleColor ? `${application.vehicleColor} ` : ""}{application.vehicleType}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Seats</dt><dd>{application.capacity}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Plate number</dt><dd>{application.plateNumber ?? "Not provided"}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Licence number</dt><dd>{application.licenseNumber ?? "Not provided"}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{application.phone ?? "Not provided"}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Applied</dt><dd>{formatDate(application.createdAt)}</dd></div>
                          </dl>
                          {!application.isActive && <p className="mt-3 text-xs text-destructive">This account is inactive and cannot be approved.</p>}
                          {application.reviewReason && (
                            <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
                              <p className="text-xs font-medium text-muted-foreground">Decision reason</p>
                              <p className="mt-1">{application.reviewReason}</p>
                              {application.reviewedAt && (
                                <p className="mt-1 text-xs text-muted-foreground">Reviewed {formatDate(application.reviewedAt)}</p>
                              )}
                            </div>
                          )}
                          <div className="mt-4 border-t pt-4">
                            <ReviewButtons application={application} onReview={beginReview} disabled={approvalMutation.isPending} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="hidden overflow-x-auto lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Applicant</TableHead>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Licence / Plate</TableHead>
                          <TableHead>Applied</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredApplications.map((application) => {
                          const badge = APPLICATION_BADGE[application.approvalStatus]
                          return (
                            <TableRow key={application.userId}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-9 w-9"><AvatarFallback>{initials(application.fullName)}</AvatarFallback></Avatar>
                                  <div>
                                    <p className="font-medium">{application.fullName ?? "Unnamed applicant"}</p>
                                    <p className="text-xs text-muted-foreground">{application.email}</p>
                                    <p className="text-xs text-muted-foreground">{application.phone ?? "No phone"}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="capitalize">{application.vehicleColor ? `${application.vehicleColor} ` : ""}{application.vehicleType}</p>
                                <p className="text-xs text-muted-foreground">{application.capacity} passenger seats</p>
                              </TableCell>
                              <TableCell>
                                <p>{application.licenseNumber ?? "No licence"}</p>
                                <p className="text-xs text-muted-foreground">Plate: {application.plateNumber ?? "Not provided"}</p>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{formatDate(application.createdAt)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                                {!application.isActive && <p className="mt-1 text-xs text-destructive">Inactive account</p>}
                                {application.reviewReason && (
                                  <p className="mt-1 max-w-56 text-xs text-muted-foreground" title={application.reviewReason}>
                                    Reason: {application.reviewReason}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end">
                                  <ReviewButtons application={application} onReview={beginReview} disabled={approvalMutation.isPending} />
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={reviewAction !== null}
        onOpenChange={(open) => {
          if (!open) setReviewAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reviewAction?.status === "approved"
                ? reviewAction.application.approvalStatus === "revoked"
                  ? "Restore driver access?"
                  : "Approve this driver?"
                : reviewAction?.status === "revoked"
                  ? "Revoke driver access?"
                  : "Reject this application?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reviewAction?.status === "approved"
                ? `${reviewAction.application.fullName ?? "This applicant"} will receive driver access. Existing sessions will be signed out.`
                : reviewAction?.status === "revoked"
                  ? `${reviewAction.application.fullName ?? "This driver"} will immediately lose driver access and be signed out.`
                  : `${reviewAction?.application.fullName ?? "This applicant"} will not receive driver access.`}
            </AlertDialogDescription>
            {reviewAction?.status !== "approved" && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="review-reason">
                  {reviewAction?.status === "revoked" ? "Revocation reason" : "Rejection reason"}
                </Label>
                <Textarea
                  id="review-reason"
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value.slice(0, 500))}
                  placeholder="Provide a clear reason for the security record..."
                  className="min-h-24 resize-none"
                  autoFocus
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>At least 10 characters required</span>
                  <span>{reviewReason.length}/500</span>
                </div>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReview}
              disabled={reviewAction?.status !== "approved" && reviewReason.trim().length < 10}
              className={
                reviewAction?.status === "approved"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
            >
              {reviewAction?.status === "approved"
                ? reviewAction.application.approvalStatus === "revoked"
                  ? "Restore access"
                  : "Approve driver"
                : reviewAction?.status === "revoked"
                  ? "Revoke access"
                  : "Reject application"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
