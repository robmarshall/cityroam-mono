import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/events", label: "Events" },
  { to: "/routes", label: "Routes" },
  { to: "/message-banks", label: "Message Banks" },
];

export default function AdminLayout() {
  const { logout } = useAuth();

  return (
    <div className="flex h-full">
      <nav className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="px-4 py-5">
          <span className="text-lg font-bold text-gray-900">City Roam</span>
          <span className="ml-1 text-xs text-gray-400">Admin</span>
        </div>

        <ul className="flex-1 space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm font-medium ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="border-t border-gray-200 p-2">
          <button
            onClick={logout}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
