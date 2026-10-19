import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/EntryViews";
import { RegisterBrowser } from "@/components/RegisterBrowser";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — Transport Register" },
      { name: "description", content: "Search register entries by date, bill, party or vehicle." },
      { property: "og:title", content: "Search — Transport Register" },
      { property: "og:description", content: "Search register entries." },
    ],
  }),
  component: () => (
    <div>
      <PageTitle title="Search" sub="Filter by date range, Bill No., party or गाड़ी नं." />
      <RegisterBrowser showFilters />
    </div>
  ),
});
