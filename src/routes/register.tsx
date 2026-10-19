import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusCircle } from "lucide-react";
import { PageTitle } from "@/components/EntryViews";
import { RegisterBrowser } from "@/components/RegisterBrowser";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Full Register — Transport Register" },
      { name: "description", content: "All transport register entries, newest first." },
      { property: "og:title", content: "Full Register — Transport Register" },
      { property: "og:description", content: "All transport register entries." },
    ],
  }),
  component: () => (
    <div>
      <PageTitle title="Full Register" sub="रजिस्टर — newest entries first">
        <Button asChild><Link to="/new"><PlusCircle className="h-4 w-4" /> New Entry</Link></Button>
      </PageTitle>
      <RegisterBrowser showFilters={false} />
    </div>
  ),
});
