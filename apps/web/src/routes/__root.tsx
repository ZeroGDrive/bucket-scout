import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";
import { UpdateChecker } from "@/components/update-checker";
import { Toaster } from "@/components/ui/sonner";

import "../index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Amarillo - R2 Browser",
      },
      {
        name: "description",
        content: "A modern file browser for Cloudflare R2",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
          storageKey="vite-ui-theme"
        >
          <div className="h-svh overflow-hidden">
            <Outlet />
          </div>
          <Toaster richColors />
          <UpdateChecker />
        </ThemeProvider>
      </QueryClientProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}
