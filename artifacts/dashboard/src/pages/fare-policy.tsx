import { useEffect, useState } from "react";
import { Calculator, Info, Save } from "lucide-react";
import { useGetActiveFarePolicy, useUpdateFarePolicy } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatPHP } from "@/lib/utils";

type FormState = {
  name: string;
  baseFare: string;
  perKmFare: string;
  minimumFare: string;
  extraPassengerFare: string;
};

const initial: FormState = {
  name: "Point-to-point fare",
  baseFare: "40",
  perKmFare: "8",
  minimumFare: "40",
  extraPassengerFare: "10",
};

export default function FarePolicyPage() {
  const { data, isLoading, refetch } = useGetActiveFarePolicy();
  const update = useUpdateFarePolicy();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initial);

  useEffect(() => {
    if (!data?.policy) return;
    setForm({
      name: data.policy.name,
      baseFare: String(data.policy.baseFare),
      perKmFare: String(data.policy.perKmFare),
      minimumFare: String(data.policy.minimumFare),
      extraPassengerFare: String(data.policy.extraPassengerFare),
    });
  }, [data?.policy]);

  const number = (key: keyof Omit<FormState, "name">) => Number(form[key]);
  const sampleFare = (distance: number, passengers: number) =>
    Math.max(
      number("minimumFare") || 0,
      Math.round(
        (number("baseFare") || 0) +
          distance * (number("perKmFare") || 0) +
          Math.max(0, passengers - 1) * (number("extraPassengerFare") || 0),
      ),
    );

  const save = () => {
    const values = {
      name: form.name.trim(),
      baseFare: number("baseFare"),
      perKmFare: number("perKmFare"),
      minimumFare: number("minimumFare"),
      extraPassengerFare: number("extraPassengerFare"),
    };
    if (!values.name || Object.values(values).some((value) => typeof value === "number" && (!Number.isFinite(value) || value < 0))) {
      toast({ title: "Check the fare values", description: "Use valid non-negative amounts.", variant: "destructive" });
      return;
    }
    update.mutate(
      { data: values },
      {
        onSuccess: () => {
          void refetch();
          toast({ title: "Fare policy activated", description: "New bookings will use these rates. Existing quotes are unchanged." });
        },
        onError: (error: any) =>
          toast({ title: "Could not update fares", description: error?.response?.data?.error ?? "Please try again.", variant: "destructive" }),
      },
    );
  };

  const field = (key: keyof Omit<FormState, "name">, label: string, help: string) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        min="0"
        step="0.01"
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-accent">
          <Calculator className="h-8 w-8" /> Fare Policy
        </h1>
        <p className="mt-1 text-muted-foreground">Control point-to-point booking fares without deploying new code.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle>Active fare matrix</CardTitle>
            <CardDescription>Saving creates an auditable policy version. It only affects future bookings.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="policy-name">Policy name</Label>
              <Input id="policy-name" value={form.name} disabled={isLoading} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            {field("baseFare", "Base fare (PHP)", "Starting amount added to every point-to-point ride.")}
            {field("perKmFare", "Per kilometre (PHP)", "Uses the Google road-route distance stored with the quote.")}
            {field("minimumFare", "Minimum fare (PHP)", "The final quote will never be lower than this amount.")}
            {field("extraPassengerFare", "Extra passenger fee (PHP)", "Applied once for each passenger after the first.")}
            <Button className="gap-2 sm:col-span-2" onClick={save} disabled={isLoading || update.isPending}>
              <Save className="h-4 w-4" /> {update.isPending ? "Activating…" : "Activate new policy"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quote preview</CardTitle>
              <CardDescription>Examples update while you edit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[[3, 1], [8, 1], [8, 3], [20, 2]].map(([km, passengers]) => (
                <div key={`${km}-${passengers}`} className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                  <span className="text-sm text-muted-foreground">{km} km · {passengers} passenger{passengers === 1 ? "" : "s"}</span>
                  <strong>{formatPHP(sampleFare(km!, passengers!))}</strong>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Loop-route fares remain configured per route. This matrix applies to passenger point-to-point bookings.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
