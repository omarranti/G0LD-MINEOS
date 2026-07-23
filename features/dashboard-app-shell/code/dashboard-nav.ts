/**
 * Navigation config for the private dashboard sidebar.
 * Order matches the build prompt's module ordering.
 */

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: string;
  group?: string;
  phase: 1 | 2 | 3 | 4 | 5 | 6;
  status: "ready" | "scaffold" | "soon";
};

export const dashboardNav: DashboardNavItem[] = [
  // Phase 2: Dashboard core (ready)
  { href: "/dashboard", label: "Dashboard", icon: "◉", phase: 2, status: "ready" },
  { href: "/actions", label: "Actions", icon: "▸", phase: 2, status: "ready" },
  { href: "/goals", label: "Goals", icon: "◆", phase: 2, status: "ready" },

  // Phase 3: CRM + career (ready)
  { href: "/network", label: "Network", icon: "❋", group: "Life", phase: 3, status: "ready" },
  { href: "/prospects", label: "Prospects", icon: "◎", group: "Life", phase: 3, status: "ready" },
  { href: "/career", label: "Career", icon: "❯", group: "Life", phase: 3, status: "ready" },
  { href: "/finances", label: "Finances", icon: "$", group: "Life", phase: 3, status: "ready" },
  { href: "/journal", label: "Journal", icon: "✎", group: "Life", phase: 3, status: "ready" },
  { href: "/social", label: "Social", icon: "◐", group: "Life", phase: 3, status: "ready" },

  // Phase 4 + 5 (ready)
  { href: "/smart", label: "Smart Tool", icon: "◈", group: "AI", phase: 4, status: "ready" },
  { href: "/discovery", label: "Discovery", icon: "◊", group: "AI", phase: 5, status: "ready" },

  // Operator: foundational inputs that shape the rest of the dashboard
  { href: "/profile", label: "Profile", icon: "◌", group: "Operator", phase: 2, status: "ready" }
];
