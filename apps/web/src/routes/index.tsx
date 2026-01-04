import { createFileRoute } from "@tanstack/react-router";
import { BrowserLayout } from "@/components/browser/layout";

export const Route = createFileRoute("/")({
  component: BrowserPage,
});

function BrowserPage() {
  return <BrowserLayout />;
}
