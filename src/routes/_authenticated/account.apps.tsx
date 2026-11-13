import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, LayoutGrid, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { listLauncherApps, signOutEverywhere } from "@/lib/sso.functions";

export const Route = createFileRoute("/_authenticated/account/apps")({
  head: () => ({
    meta: [
      { title: "Your apps — EGREED Identity" },
      { name: "description", content: "Open every EGREED app you use with one account, or sign out of all of them at once." },
      { property: "og:title", content: "Your apps — EGREED Identity" },
      { property: "og:description", content: "Open every EGREED app you use with one account, or sign out of all of them at once." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppsPage,
});

function AppsPage() {
  const navigate = useNavigate();
  const fetchApps = useServerFn(listLauncherApps);
  const globalOut = useServerFn(signOutEverywhere);
  const { data, isPending } = useQuery({ queryKey: ["sso", "apps"], queryFn: () => fetchApps() });

  const outMutation = useMutation({
    mutationFn: async () => {
      await globalOut();
      await supabase.auth.signOut({ scope: "global" });
    },
    onSuccess: () => {
      toast.success("Signed out of every EGREED app and device");
      navigate({ to: "/auth" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Your apps</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            EGREED apps you use with this account. Open one — you're already signed in.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={outMutation.isPending}>
              <LogOut className="size-4" /> Sign out everywhere
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of everything?</AlertDialogTitle>
              <AlertDialogDescription>
                Every EGREED app loses access and every device, including this one, is signed out.
                You'll need to sign in again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => outMutation.mutate()}>Sign out everywhere</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : !data?.length ? (
        <div className="surface-panel p-8 text-center">
          <LayoutGrid className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No apps yet. Sign in to an EGREED app with your EGREED ID and it will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((app) => (
            <div key={app.clientId} className="surface-panel flex flex-col p-5">
              <div className="flex items-center gap-3">
                {app.logoUrl ? (
                  <img src={app.logoUrl} alt="" className="size-10 rounded-md object-cover" />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-md bg-primary/15 font-display font-semibold text-primary">
                    {app.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{app.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Last used {new Date(app.lastUsed).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {app.description && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{app.description}</p>
              )}
              <div className="mt-auto pt-4">
                {app.homepageUrl ? (
                  <Button asChild size="sm" className="w-full">
                    <a href={app.homepageUrl} target="_blank" rel="noopener noreferrer">
                      Open <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">This app has no web address set.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
